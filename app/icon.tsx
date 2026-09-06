import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Placeholder gerado — substituir por app/icon.png com o favicon real assim que o
// download dos assets do site atual for autorizado (ver checklist no README).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#121415",
          borderRadius: 12,
        }}
      >
        <span
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: "#f2ca50",
          }}
        >
          R
        </span>
      </div>
    ),
    { ...size }
  );
}
