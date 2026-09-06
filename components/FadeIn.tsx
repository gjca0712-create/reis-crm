"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type FadeInProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  from?: "up" | "left" | "right" | "none";
};

const FROM_CLASS: Record<NonNullable<FadeInProps["from"]>, string> = {
  up: "translate-y-7",
  left: "-translate-x-7",
  right: "translate-x-7",
  none: "",
};

export default function FadeIn({
  children,
  className = "",
  delay = 0,
  from = "up",
}: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:translate-x-0 ${
        visible ? "opacity-100 translate-x-0 translate-y-0" : `opacity-0 ${FROM_CLASS[from]}`
      } ${className}`}
    >
      {children}
    </div>
  );
}
