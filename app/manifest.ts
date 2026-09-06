import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.fullName,
    short_name: siteConfig.name,
    description: `${siteConfig.slogan} ${siteConfig.fullName}, ${siteConfig.address.city} - ${siteConfig.address.state}`,
    start_url: "/",
    display: "standalone",
    background_color: "#121415",
    theme_color: "#121415",
    lang: "pt-BR",
    icons: [
      {
        src: "/icon",
        sizes: "64x64",
        type: "image/png",
      },
    ],
  };
}
