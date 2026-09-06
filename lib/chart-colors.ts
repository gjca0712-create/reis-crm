// Sequential gold ramp (magnitude encoding) — light -> dark, monotone lightness.
export const GOLD_SEQUENTIAL = ["#F3E7C4", "#E9D49A", "#DEBF72", "#D4AF37", "#B8942A", "#96771F", "#6E5716"];

// Fixed status scale — never themed. Used for recency/health states (icon + label, never color alone).
export const STATUS_COLORS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

// 3-tier intensity tuned for a dark surface (brighter = hotter). All tiers keep
// solid contrast against the near-black background, unlike the full 7-step ramp
// whose darkest steps would wash out.
export function heatColor(ratio: number) {
  if (ratio >= 0.66) return "#F3E7C4";
  if (ratio >= 0.33) return "#D4AF37";
  return "#96771F";
}

export const CHART_INK = {
  primary: "#F7F3EA",
  secondary: "#C8BFA9",
  muted: "#8F8471",
  grid: "#2E2A22",
  baseline: "#3D372C",
  surface: "#1A1712",
};
