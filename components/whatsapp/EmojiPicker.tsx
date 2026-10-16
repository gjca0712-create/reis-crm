"use client";

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";

// Botão de emoji da caixa de mensagem (Suporte e Chat interno), igual ao do
// WhatsApp Web: abre um painel por cima da caixa, cada clique põe o emoji onde
// está o cursor e o painel continua aberto (fecha clicando fora ou no Esc).
// Lista própria, sem biblioteca: os do dia a dia de uma loja, por categoria.
// Os últimos usados ficam em "Recentes" (só neste navegador).
const CATEGORIES: { id: string; icon: string; label: string; emojis: string[] }[] = [
  {
    id: "carinhas",
    icon: "😀",
    label: "Carinhas",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩",
      "😘", "😗", "😚", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐",
      "😑", "😶", "😏", "😒", "🙄", "😬", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🥵", "🥶",
      "🥴", "😵", "🤯", "🤠", "🥳", "😎", "🤓", "🧐", "😕", "😟", "🙁", "😮", "😯", "😲", "😳", "🥺",
      "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤",
      "😡", "😠", "🤬",
    ],
  },
  {
    id: "gestos",
    icon: "👍",
    label: "Gestos",
    emojis: [
      "👍", "👎", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "✋",
      "🤚", "🖐️", "👋", "🤝", "🙏", "👏", "🙌", "👐", "🤲", "💪", "✍️", "🫶", "👀", "🫡", "🤷", "🤷‍♂️",
      "🤷‍♀️", "🙋", "🙋‍♂️", "🙋‍♀️", "🙇", "🙇‍♂️", "🙇‍♀️", "🤦", "🤦‍♂️", "🤦‍♀️",
    ],
  },
  {
    id: "coracoes",
    icon: "❤️",
    label: "Corações e festa",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖",
      "💘", "💝", "✨", "⭐", "🌟", "🔥", "💯", "🎉", "🎊", "🎁", "🎈", "🏆", "🥇", "🎂", "🍾", "🥂",
    ],
  },
  {
    id: "loja",
    icon: "🛠️",
    label: "Loja e obra",
    emojis: [
      "🛠️", "🔨", "🪛", "🔧", "🪚", "⛏️", "🧱", "🪵", "🏗️", "🏠", "🏡", "🏢", "🚪", "🪟", "🛁", "🚿",
      "🚽", "💡", "🔌", "🔋", "🎨", "🖌️", "🪣", "🧰", "📦", "🚚", "🛻", "🚛", "📏", "📐", "🧾", "💵",
      "💰", "💳", "🏷️", "🛒", "📄", "📋", "📅", "🗓️", "⏰", "⏳", "📍", "🗺️", "📞", "📱", "💬", "📧",
    ],
  },
  {
    id: "simbolos",
    icon: "✅",
    label: "Símbolos",
    emojis: [
      "✅", "☑️", "✔️", "❌", "❎", "⚠️", "❗", "❓", "‼️", "⁉️", "🚫", "⛔", "🔴", "🟠", "🟡", "🟢",
      "🔵", "🟣", "⚫", "⚪", "➡️", "⬅️", "⬆️", "⬇️", "🔝", "🆗", "🆕", "🆓", "ℹ️", "🔁", "🔄", "⏩",
      "📌", "🔒", "🔓", "🔔", "🔕", "💤",
    ],
  },
  {
    id: "comida",
    icon: "☕",
    label: "Comida e clima",
    emojis: [
      "☕", "🍕", "🍔", "🍟", "🌭", "🥪", "🍞", "🧀", "🍗", "🍖", "🥩", "🍝", "🍲", "🍰", "🍫", "🍬",
      "🍦", "🍉", "🍎", "🍌", "🍇", "🍓", "🥥", "🍺", "🍻", "🥤", "🧃", "☀️", "🌤️", "⛅", "🌧️", "⛈️",
      "🌈", "❄️", "🌙", "🌻", "🌹", "🌱", "🌳", "🐶", "🐱",
    ],
  },
];

const RECENT_KEY = "wa-emoji-recentes";
const MAX_RECENT = 24;

function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((e) => typeof e === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

// className: o ReplyForm esconde no celular, que já tem emoji no teclado e
// precisa da largura pra caixa de texto.
export function EmojiPicker({ onPick, className = "" }: { onPick: (emoji: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [category, setCategory] = useState("carinhas");
  const box = useRef<HTMLDivElement>(null);

  // Abre já nos Recentes, se tiver algum.
  function toggle() {
    if (!open) {
      const r = readRecent();
      setRecent(r);
      setCategory(r.length ? "recentes" : "carinhas");
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(emoji: string) {
    onPick(emoji);
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  }

  const tabs = [
    ...(recent.length ? [{ id: "recentes", icon: "🕘", label: "Recentes", emojis: recent }] : []),
    ...CATEGORIES,
  ];
  const current = tabs.find((t) => t.id === category) ?? tabs[0];

  return (
    <div ref={box} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label="Emojis"
        title="Emojis"
        className={`p-2.5 rounded-full transition-colors ${
          open ? "text-wa-green bg-wa-active" : "text-wa-muted hover:text-wa-text hover:bg-wa-active"
        }`}
      >
        <Smile className="w-5 h-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Escolher emoji"
          className="absolute bottom-full left-0 z-30 mb-2 w-[min(20.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-wa-border bg-wa-panel shadow-2xl"
        >
          <div className="flex gap-0.5 border-b border-wa-border px-1.5 pt-1.5" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === current.id}
                aria-label={t.label}
                title={t.label}
                onClick={() => setCategory(t.id)}
                className={`flex-1 rounded-t-md border-b-2 py-1.5 text-lg leading-none transition-colors ${
                  t.id === current.id ? "border-wa-green bg-wa-active/60" : "border-transparent hover:bg-wa-active/40"
                }`}
              >
                {t.icon}
              </button>
            ))}
          </div>
          <p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-wa-muted">{current.label}</p>
          <div className="grid h-56 grid-cols-8 content-start gap-0.5 overflow-y-auto px-1.5 pb-2 pt-1">
            {current.emojis.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => pick(e)}
                className="grid aspect-square place-items-center rounded-md text-[22px] leading-none hover:bg-wa-active"
                aria-label={e}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
