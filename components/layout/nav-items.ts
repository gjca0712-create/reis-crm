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
  History,
  type LucideIcon,
} from "lucide-react";
import type { Feature } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; feature: Feature };

export const NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, feature: "dashboard" },
  { href: "/admin/clientes", label: "Clientes", icon: Users, feature: "clientes" },
  { href: "/admin/leads", label: "Leads (site)", icon: UserPlus, feature: "leads" },
  { href: "/admin/indicadores", label: "Indicadores", icon: Handshake, feature: "indicadores" },
  { href: "/admin/vendas", label: "Vendas", icon: ShoppingCart, feature: "vendas" },
  { href: "/admin/ocorrencias", label: "Ocorrências", icon: AlertTriangle, feature: "ocorrencias" },
  { href: "/admin/bairros", label: "Bairros", icon: MapPin, feature: "bairros" },
  { href: "/admin/whatsapp/suporte", label: "WhatsApp Suporte", icon: MessageCircle, feature: "whatsapp_suporte" },
  { href: "/admin/whatsapp/campanhas", label: "WhatsApp Campanhas", icon: Send, feature: "whatsapp_campanhas" },
  { href: "/admin/atendentes", label: "Atendentes", icon: Headphones, feature: "atendentes" },
  { href: "/admin/avaliacoes", label: "Avaliações", icon: Star, feature: "avaliacoes" },
  { href: "/admin/auditoria", label: "Auditoria", icon: History, feature: "auditoria" },
];
