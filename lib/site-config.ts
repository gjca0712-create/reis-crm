// Ponto único de edição para os fatos de negócio (endereço, CNPJ, horário, fundação).
// Todos os valores abaixo foram extraídos ao vivo de reismateriais.com.br (WebFetch +
// inspeção de DOM) — não inventados. PLACEHOLDER marca o que ainda falta confirmar.
// Número/link de WhatsApp ficam em lib/whatsapp.ts — este arquivo só referencia o número
// já formatado para exibição, não gera links (evita duas fontes de verdade divergentes).
import { WHATSAPP_NUMBER } from "./whatsapp";

const ADDRESS_FULL = "R. Esmeraldo Elias de Jesus, 75 - Centro, Cruz das Almas - BA";

// PLACEHOLDER: confirmar com o cliente se o novo site substitui o atual neste domínio
// ou sobe em um subdomínio de staging primeiro.
const SITE_URL = "https://www.reismateriais.com.br";

export const siteConfig = {
  siteUrl: SITE_URL,

  name: "Reis Materiais",
  fullName: "Reis Materiais de Construção",
  legalName: "T.A. Reis e Cia Ltda",
  cnpj: "04.917.591/0001-17",
  slogan: "Tradição que edifica.",
  foundedYear: 1996,
  // Calculado a partir do ano de fundação — não deixar número fixo, que
  // envelhece (o site já dizia "25 anos" e "Fundada em 1996" na mesma página).
  yearsOfTradition: new Date().getFullYear() - 1996,

  address: {
    street: "R. Esmeraldo Elias de Jesus, 75",
    neighborhood: "Centro",
    city: "Cruz das Almas",
    state: "BA",
    postalCode: "44380-000",
    full: ADDRESS_FULL,
  },

  phone: {
    display: "(75) 3621-2477",
    e164: "+557536212477",
  },

  whatsapp: {
    number: WHATSAPP_NUMBER,
    display: "(75) 98805-5098",
  },

  hours: {
    weekdays: "Segunda a Sexta: 08h às 18h",
    saturday: "Sábados: 08h às 12h",
  },

  mapsEmbedSrc:
    "https://www.google.com/maps?q=" + encodeURIComponent(ADDRESS_FULL) + "&output=embed",
  mapsDirectionsUrl:
    "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(ADDRESS_FULL),

  // PLACEHOLDER: nenhuma rede social está confirmada publicamente no site atual.
  social: {
    instagram: "#",
    facebook: "#",
  },
} as const;
