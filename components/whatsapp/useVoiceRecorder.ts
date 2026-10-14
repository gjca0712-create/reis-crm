"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_NOTE_MIMETYPE, webmOpusToOgg } from "@/lib/whatsapp/voice-note";

// Gravação de mensagem de voz no ReplyForm, igual ao WhatsApp Web: microfone →
// gravando (tempo + nível do som) → parar pra ouvir ou mandar direto.
// "idle" → "starting" (pedindo o microfone) → "recording" → "review" → "sending".
export type VoiceRecorderState = "idle" | "starting" | "recording" | "review" | "sending";

// voiceNote: Ogg/Opus — vai como áudio de voz. Senão (Safari grava MP4/AAC),
// vai como arquivo de áudio comum, que toca em qualquer celular.
export type RecordedVoice = { file: File; voiceNote: boolean; url: string };

export const MAX_RECORDING_SECONDS = 10 * 60;
export const LEVEL_BARS = 80;

// Na ordem de preferência: Ogg/Opus pronto (Firefox), WebM/Opus (Chrome e Edge —
// vira Ogg em lib/whatsapp/voice-note.ts), MP4 (Safari).
const RECORDER_TYPES = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"];

type Live = {
  stream: MediaStream;
  recorder: MediaRecorder;
  ctx: AudioContext | null;
  timer: number;
  stopped: Promise<Blob>;
};

export function canRecordVoice(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function micError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "O navegador bloqueou o microfone. Libere no cadeado ao lado do endereço do site e tente de novo.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Nenhum microfone encontrado neste computador.";
  if (name === "NotReadableError") return "O microfone está sendo usado por outro programa.";
  return "Não deu pra abrir o microfone.";
}

// Solta o microfone (some o aviso de "gravando" do navegador) e o medidor.
function freeLive(l: Live) {
  window.clearInterval(l.timer);
  l.stream.getTracks().forEach((t) => t.stop());
  l.ctx?.close().catch(() => {});
}

async function toVoiceFile(blob: Blob): Promise<RecordedVoice> {
  const type = blob.type.toLowerCase();
  let file: File;
  let voiceNote = true;
  if (type.startsWith("audio/ogg")) {
    file = new File([blob], "audio.ogg", { type: VOICE_NOTE_MIMETYPE });
  } else if (type.includes("webm")) {
    // Sem cair pro WebM se a conversão falhar: iPhone não toca WebM, e o
    // atendente acharia que o cliente recebeu.
    const ogg = webmOpusToOgg(new Uint8Array(await blob.arrayBuffer()));
    file = new File([ogg as BlobPart], "audio.ogg", { type: VOICE_NOTE_MIMETYPE });
  } else {
    voiceNote = false;
    file = new File([blob], "audio.m4a", { type: "audio/mp4" });
  }
  return { file, voiceNote, url: URL.createObjectURL(file) };
}

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const live = useRef<Live | null>(null);
  const mounted = useRef(true);
  const stopRef = useRef<() => void>(() => {});

  const release = useCallback(() => {
    if (live.current) freeLive(live.current);
    live.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      release();
    };
  }, [release]);

  useEffect(() => {
    if (!recorded) return;
    return () => URL.revokeObjectURL(recorded.url);
  }, [recorded]);

  const start = useCallback(async () => {
    setError(null);
    if (!canRecordVoice()) {
      setError("Este navegador não grava áudio.");
      return;
    }
    setState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      if (mounted.current) {
        setError(micError(e));
        setState("idle");
      }
      return;
    }
    if (!mounted.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const mimeType = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    let recorder: MediaRecorder;
    try {
      // 32 kbps: voz clara e ~4 KB por segundo (o WhatsApp usa por volta disso).
      recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Este navegador não grava áudio.");
      setState("idle");
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "" }));
    });

    // Medidor: o nível do som a cada 100 ms, pra ver que o microfone está pegando.
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      void ctx.resume();
    } catch {
      ctx = null;
      analyser = null;
    }
    const samples = new Float32Array(analyser?.fftSize ?? 0);
    const startedAt = performance.now();
    setSeconds(0);
    setLevels([]);
    const timer = window.setInterval(() => {
      const s = (performance.now() - startedAt) / 1000;
      setSeconds(s);
      if (analyser) {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        // Raiz: fala baixa ainda mexe a barra, e fala alta não fica sempre no topo.
        const level = Math.min(1, Math.sqrt(Math.sqrt(sum / samples.length)) * 1.8);
        setLevels((prev) => [...prev.slice(-(LEVEL_BARS - 1)), level]);
      }
      if (s >= MAX_RECORDING_SECONDS) stopRef.current();
    }, 100);

    live.current = { stream, recorder, ctx, timer, stopped };
    recorder.start();
    setState("recording");
  }, []);

  // Para a gravação e prepara o arquivo (WebM → Ogg). null = deu errado (o erro
  // fica em `error`).
  const stop = useCallback(async (): Promise<RecordedVoice | null> => {
    const l = live.current;
    if (!l) return null;
    live.current = null; // um segundo clique não para de novo
    window.clearInterval(l.timer);
    if (l.recorder.state !== "inactive") l.recorder.stop();
    const blob = await l.stopped;
    freeLive(l);
    try {
      const r = await toVoiceFile(blob);
      if (mounted.current) {
        setRecorded(r);
        setState("review");
      }
      return r;
    } catch {
      if (mounted.current) {
        setError("Não deu pra preparar o áudio. Confira o microfone e grave de novo.");
        setState("idle");
      }
      return null;
    }
  }, []);

  useEffect(() => {
    stopRef.current = () => void stop();
  }, [stop]);

  // Pra mandar: para (se ainda está gravando) e devolve o arquivo.
  const take = useCallback(async (): Promise<RecordedVoice | null> => {
    const r = live.current ? await stop() : recorded;
    if (r && mounted.current) setState("sending");
    return r;
  }, [stop, recorded]);

  const cancel = useCallback(() => {
    const l = live.current;
    if (l) {
      l.recorder.ondataavailable = null;
      if (l.recorder.state !== "inactive") l.recorder.stop();
    }
    release();
    setRecorded(null);
    setSeconds(0);
    setLevels([]);
    setState("idle");
  }, [release]);

  return { state, seconds, levels, error, recorded, start, stop, take, cancel, clearError: () => setError(null) };
}
