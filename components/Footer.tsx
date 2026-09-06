import Link from "next/link";
import { siteConfig } from "@/lib/site-config";
import { categories } from "@/data/categories";
import { MapPinIcon, PhoneIcon, ClockIcon, WhatsAppIcon, InstagramIcon, FacebookIcon } from "@/components/icons";

export default function Footer() {
  return (
    <footer className="border-t border-outline-variant/20 bg-surface-container-lowest text-zinc-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-lg font-bold text-on-background">
            REIS <span className="text-primary">MATERIAIS</span>
          </p>
          <p className="mt-3 max-w-xs text-sm text-zinc-100/70">
            {siteConfig.slogan} Desde {siteConfig.foundedYear}, o maior estoque de materiais de
            construção de Cruz das Almas e região.
          </p>
          <div className="mt-4 flex gap-3">
            <a
              href={siteConfig.social.instagram}
              aria-label="Instagram da Reis Materiais"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-zinc-100/70 transition-colors hover:text-primary"
            >
              <InstagramIcon className="h-4 w-4" />
            </a>
            <a
              href={siteConfig.social.facebook}
              aria-label="Facebook da Reis Materiais"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-zinc-100/70 transition-colors hover:text-primary"
            >
              <FacebookIcon className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div>
          <p className="font-label-bold text-sm font-semibold text-on-background">Catálogo</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-100/70">
            {categories.map((cat) => (
              <li key={cat.slug}>
                <Link href={`/catalogo/${cat.slug}`} className="transition-colors hover:text-primary">
                  {cat.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-label-bold text-sm font-semibold text-on-background">Institucional</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-100/70">
            <li>
              <Link href="/nossa-historia" className="transition-colors hover:text-primary">
                Nossa História
              </Link>
            </li>
            <li>
              <Link href="/estrutura" className="transition-colors hover:text-primary">
                Estrutura
              </Link>
            </li>
            <li>
              <Link href="/blog" className="transition-colors hover:text-primary">
                Blog
              </Link>
            </li>
            <li>
              <Link href="/trabalhe-conosco" className="transition-colors hover:text-primary">
                Trabalhe Conosco
              </Link>
            </li>
            <li>
              <Link href="/contato" className="transition-colors hover:text-primary">
                Contato
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="font-label-bold text-sm font-semibold text-on-background">Atendimento</p>
          <ul className="mt-3 space-y-3 text-sm text-zinc-100/70">
            <li className="flex items-start gap-2">
              <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{siteConfig.address.full}</span>
            </li>
            <li className="flex items-start gap-2">
              <PhoneIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{siteConfig.phone.display}</span>
            </li>
            <li className="flex items-start gap-2">
              <WhatsAppIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{siteConfig.whatsapp.display}</span>
            </li>
            <li className="flex items-start gap-2">
              <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                {siteConfig.hours.weekdays}
                <br />
                {siteConfig.hours.saturday}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-outline-variant/20 px-6 py-6 text-xs text-zinc-100/50">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Razão Social: {siteConfig.legalName} · Nome Fantasia: {siteConfig.fullName} · CNPJ:{" "}
            {siteConfig.cnpj}
          </p>
          <p>© {new Date().getFullYear()} {siteConfig.fullName}. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
