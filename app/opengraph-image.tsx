import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site-config";

export const dynamic = "force-static";
export const alt = siteConfig.fullName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#121415",
          padding: 80,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div style={{ width: 40, height: 2, background: "#f2ca50" }} />
          <span
            style={{
              fontSize: 26,
              color: "#f2ca50",
              letterSpacing: 6,
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            {siteConfig.yearsOfTradition} anos em Cruz das Almas
          </span>
        </div>
        <span
          style={{
            fontSize: 68,
            fontWeight: 700,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.15,
            display: "flex",
          }}
        >
          O Maior Estoque de Materiais de Construção da Região
        </span>
        <span
          style={{
            marginTop: 32,
            fontSize: 28,
            color: "#a1a1aa",
            display: "flex",
          }}
        >
          {siteConfig.fullName}
        </span>
      </div>
    ),
    { ...size }
  );
}
