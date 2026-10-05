"use client";

import { useEffect, useRef, useState } from "react";

// Foto de perfil do WhatsApp do cliente; enquanto carrega, ou se ele não tem
// foto (ou esconde), fica a inicial do nome — igual ao WhatsApp.
export function ContactAvatar({
  customerId,
  name,
  large = false,
  className = "",
}: {
  customerId: string;
  name: string;
  large?: boolean;
  className?: string;
}) {
  const img = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");

  // Foto que já estava no cache do navegador pode terminar de carregar antes
  // do React ligar o onLoad — confere na montagem.
  useEffect(() => {
    const el = img.current;
    if (el?.complete) setState(el.naturalWidth > 0 ? "ok" : "none");
  }, []);

  return (
    <span
      className={`relative overflow-hidden rounded-full bg-[#6a7175]/40 flex items-center justify-center font-medium text-wa-text shrink-0 ${className}`}
    >
      {name.slice(0, 1).toUpperCase()}
      {state !== "none" && (
        // eslint-disable-next-line @next/next/no-img-element -- imagem dinâmica da nossa própria API
        <img
          ref={img}
          src={`/api/whatsapp/avatar/${customerId}${large ? "?tamanho=grande" : ""}`}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setState("ok")}
          onError={() => setState("none")}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
