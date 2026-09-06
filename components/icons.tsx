import type { ReactElement, SVGProps } from "react";
import type { IconName } from "@/lib/types";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// ---------- Categorias ----------

export function BasicoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 20h18" />
      <path d="M5 20V10l7-5 7 5v10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export function AcabamentoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  );
}

export function EletricaIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" strokeLinejoin="round" />
    </svg>
  );
}

export function HidraulicaIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3v5a3 3 0 003 3h1a3 3 0 003-3V3" />
      <path d="M11 11v6" />
      <path d="M6 21c0-3 2-4 5-4s5 1 5 4" />
    </svg>
  );
}

export function FerramentasIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14.5 6.5a4 4 0 01-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 015.3-5.3l-2.6 2.6-2-2 2.6-2.6z" />
    </svg>
  );
}

export function FundacaoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 21V9M8 21V9M12 21V9M16 21V9M20 21V9" />
      <path d="M2 9l10-6 10 6" />
      <path d="M2 21h20" />
    </svg>
  );
}

export function TintasIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3h9v6l2 2v2H4v-2l2-2z" />
      <path d="M9 13v5a3 3 0 003 3 3 3 0 003-3v-5" />
    </svg>
  );
}

export const CATEGORY_ICONS: Record<IconName, (props: IconProps) => ReactElement> = {
  basico: BasicoIcon,
  acabamento: AcabamentoIcon,
  eletrica: EletricaIcon,
  hidraulica: HidraulicaIcon,
  ferramentas: FerramentasIcon,
  fundacao: FundacaoIcon,
  tintas: TintasIcon,
  entrega: (props) => <TruckIcon {...props} />,
  estoque: (props) => <StockIcon {...props} />,
  atendimento: (props) => <SupportIcon {...props} />,
};

// ---------- Diferenciais ----------

export function TruckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="1" y="7" width="13" height="10" rx="1" />
      <path d="M14 10h4l4 3.5V17h-8z" />
      <circle cx="6" cy="19" r="1.6" />
      <circle cx="17.5" cy="19" r="1.6" />
    </svg>
  );
}

export function StockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  );
}

export function SupportIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 13a8 8 0 0116 0" />
      <rect x="2" y="13" width="5" height="6" rx="1.5" />
      <rect x="17" y="13" width="5" height="6" rx="1.5" />
      <path d="M20 19v1a3 3 0 01-3 3h-3" />
    </svg>
  );
}

// ---------- Funcionais ----------

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5h16M7 12h10M11 19h2" />
    </svg>
  );
}

export function CartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3h2.5l2.6 12.5a2 2 0 002 1.6h8.6a2 2 0 002-1.6L21 8H6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M12 2.5l2.94 6.24 6.81.79-5.06 4.75 1.4 6.77L12 17.77l-6.09 3.28 1.4-6.77-5.06-4.75 6.81-.79L12 2.5z" />
    </svg>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21.5s7-6.4 7-12A7 7 0 105 9.5c0 5.6 7 12 7 12z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A15 15 0 015 6a2 2 0 012-2z" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 21v-8h3l.5-4H14V6.5A1.5 1.5 0 0115.5 5H17V1.5A20 20 0 0014.8 1 4.3 4.3 0 0010 5.6V9H7v4h3v8z" />
    </svg>
  );
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M17.5 14.4c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.66.15-.2.3-.76.96-.93 1.16-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.34.44-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.6-.91-2.19-.24-.57-.48-.5-.66-.5-.17-.01-.37-.01-.56-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.87 1.22 3.07c.15.2 2.1 3.2 5.09 4.49.71.31 1.26.49 1.7.62.71.23 1.36.2 1.87.12.57-.09 1.75-.71 2-1.4.24-.68.24-1.27.17-1.4-.07-.12-.27-.2-.56-.35z" />
      <path d="M12.04 2C6.58 2 2.15 6.42 2.15 11.88c0 1.76.46 3.42 1.27 4.86L2 22l5.4-1.41a9.85 9.85 0 004.64 1.18h.01c5.46 0 9.9-4.42 9.9-9.88C21.94 6.42 17.5 2 12.04 2zm0 18.06h-.01a8.2 8.2 0 01-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.17 8.17 0 01-1.26-4.34c0-4.53 3.7-8.22 8.25-8.22 2.2 0 4.27.86 5.83 2.41a8.17 8.17 0 012.42 5.82c0 4.53-3.7 8.19-8.26 8.19z" />
    </svg>
  );
}
