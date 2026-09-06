import type { ProductSpec } from "@/lib/types";

export default function ProductSpecsTable({ specs }: { specs: ProductSpec[] }) {
  if (specs.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/20">
      <table className="w-full text-sm">
        <tbody>
          {specs.map((spec) => (
            <tr key={spec.label} className="border-b border-outline-variant/10 last:border-0">
              <th className="w-1/3 bg-surface-container px-4 py-3 text-left font-label-bold font-semibold text-on-background">
                {spec.label}
              </th>
              <td className="px-4 py-3 text-zinc-100/80">{spec.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
