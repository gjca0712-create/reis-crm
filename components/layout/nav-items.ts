import {
  LayoutDashboard,
  Users,
  Handshake,
  ShoppingCart,
  MapPin,
  MessageCircle,
  Send,
  Headphones,
  Star,
  AlertTriangle,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { Feature } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; feature: Feature };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, feature: "dashboard" },
  { href: "/clientes", label: "Clientes", icon: Users, feature: "clientes" },
  { href: "/leads", label: "Leads (site)", icon: UserPlus, feature: "leads" },
  { href: "/indicadores", label: "Indicadores", icon: Handshake, feature: "indicadores" },
  { href: "/vendas", label: "Vendas", icon: ShoppingCart, feature: "vendas" },
  { href: "/ocorrencias", label: "Ocorrências", icon: AlertTriangle, feature: "ocorrencias" },
  { href: "/bairros", label: "Bairros", icon: MapPin, feature: "bairros" },
  { href: "/whatsapp/suporte", label: "WhatsApp Suporte", icon: MessageCircle, feature: "whatsapp_suporte" },
  { href: "/whatsapp/campanhas", label: "WhatsApp Campanhas", icon: Send, feature: "whatsapp_campanhas" },
  { href: "/atendentes", label: "Atendentes", icon: Headphones, feature: "atendentes" },
  { href: "/avaliacoes", label: "Avaliações", icon: Star, feature: "avaliacoes" },
];
