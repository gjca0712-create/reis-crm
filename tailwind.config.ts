import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#0F0D0A",
        surface: {
          DEFAULT: "#1A1712",
          raised: "#221E17",
        },
        border: {
          DEFAULT: "#2E2A22",
          strong: "#3D372C",
        },
        ink: {
          primary: "#F7F3EA",
          secondary: "#C8BFA9",
          muted: "#8F8471",
        },
        gold: {
          100: "#F3E7C4",
          200: "#E9D49A",
          300: "#DEBF72",
          400: "#D4AF37",
          500: "#B8942A",
          600: "#96771F",
          700: "#6E5716",
        },
        // WhatsApp Web (tema escuro) — telas de conversa (Suporte e Chat interno),
        // pra ficarem com a cara do WhatsApp que a equipe já conhece.
        wa: {
          bg: "#0b141a",
          list: "#111b21",
          panel: "#202c33",
          active: "#2a3942",
          border: "#222d34",
          out: "#005c4b",
          text: "#e9edef",
          muted: "#8696a0",
          green: "#00a884",
          note: "#182229",
        },
        status: {
          good: "#0ca30c",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
        },

        // Paleta do site institucional (Material-3-like) — nomes planos pra
        // bater com as classes existentes (bg-background, text-on-background
        // etc.), vindas de quando o site usava Tailwind v4 com @theme inline.
        background: "#121415",
        "surface-container-lowest": "#0c0e0f",
        "surface-container": "#1e2021",
        "surface-bright": "#38393a",
        primary: "#f2ca50",
        "primary-container": "#d4af37",
        "on-primary-container": "#554300",
        "on-background": "#ffffff",
        "outline-variant": "#ffffff",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-oswald)", "Arial Narrow", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
