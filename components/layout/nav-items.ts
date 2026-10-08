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
  Landmark,
  Package,
  MessagesSquare,
  BarChart3,
  Archive,
  type LucideIcon,
} from "lucide-react";
import type { Feature } from "@/lib/permissions";

// feature ausente = tela de toda a equipe (só exige login). badge: contador
// ao lado do nome (components/layout/TeamChatBadge.tsx).
export type NavItem = { href: string; label: string; icon: LucideIcon; feature?: Feature; badge?: "team-chat" };

export const NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, feature: "dashboard" },
  { href: "/admin/financeiro", label: "Financeiro", icon: Landmark, feature: "financeiro" },
  { href: "/admin/produtos", label: "Produtos", icon: Package, feature: "produtos" },
  { href: "/admin/clientes", label: "Clientes", icon: Users, feature: "clientes" },
  { href: "/admin/leads", label: "Leads (site)", icon: UserPlus, feature: "leads" },
  { href: "/admin/indicadores", label: "Indicadores", icon: Handshake, feature: "indicadores" },
  { href: "/admin/vendas", label: "Vendas", icon: ShoppingCart, feature: "vendas" },
  { href: "/admin/ocorrencias", label: "Ocorrências", icon: AlertTriangle, feature: "ocorrencias" },
  { href: "/admin/bairros", label: "Bairros", icon: MapPin, feature: "bairros" },
  { href: "/admin/whatsapp/suporte", label: "WhatsApp Suporte", icon: MessageCircle, feature: "whatsapp_suporte" },
  { href: "/admin/whatsapp/campanhas", label: "WhatsApp Campanhas", icon: Send, feature: "whatsapp_campanhas" },
  { href: "/admin/whatsapp/metricas", label: "Métricas de atendimento", icon: BarChart3, feature: "whatsapp_gestao" },
  { href: "/admin/whatsapp/antigas", label: "Mensagens antigas", icon: Archive, feature: "whatsapp_gestao" },
  { href: "/admin/chat-interno", label: "Chat interno", icon: MessagesSquare, badge: "team-chat" },
  { href: "/admin/atendentes", label: "Atendentes", icon: Headphones, feature: "atendentes" },
  { href: "/admin/avaliacoes", label: "Avaliações", icon: Star, feature: "avaliacoes" },
  { href: "/admin/auditoria", label: "Auditoria", icon: History, feature: "auditoria" },
];

// Menu lateral recolhido (só ícones). Lido pelo layout no servidor, pra página
// já abrir do jeito que a pessoa deixou, sem piscar aberto e depois fechar.
export const SIDEBAR_COOKIE = "menu_recolhido";
