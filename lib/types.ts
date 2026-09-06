export type StockStatus = "em-estoque" | "sob-encomenda" | "indisponivel";

export type IconName =
  | "basico"
  | "acabamento"
  | "eletrica"
  | "hidraulica"
  | "ferramentas"
  | "fundacao"
  | "tintas"
  | "entrega"
  | "estoque"
  | "atendimento";

export type Category = {
  slug: string;
  name: string;
  description: string;
  icon: IconName;
};

export type Brand = {
  slug: string;
  name: string;
};

export type ProductSpec = {
  label: string;
  value: string;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  categorySlug: string;
  subcategory?: string;
  brandSlug?: string;
  price: number;
  /** Unidade de venda em texto livre ("saco 50kg", "m³", "un", "barra") — a variação real é grande demais para um enum. */
  unit: string;
  stock: StockStatus;
  images: string[];
  shortDescription: string;
  specs: ProductSpec[];
  /** Curadoria explícita; se omitido, cai para produtos da mesma categoria. */
  relatedSlugs?: string[];
};

export type CartLine = {
  productId: string;
  quantity: number;
};

export type ResolvedCartLine = {
  product: Product;
  quantity: number;
  lineTotal: number;
};

export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "callout"; text: string };

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  readTimeMinutes: number;
  coverImage: string;
  body: ContentBlock[];
};
