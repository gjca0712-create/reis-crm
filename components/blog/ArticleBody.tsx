import type { ContentBlock } from "@/lib/types";

export default function ArticleBody({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={index} className="text-base leading-relaxed text-zinc-100/80">
                {block.text}
              </p>
            );
          case "heading": {
            const Tag = block.level === 2 ? "h2" : "h3";
            return (
              <Tag
                key={index}
                className={
                  block.level === 2
                    ? "font-display text-2xl font-bold text-on-background pt-2"
                    : "font-display text-xl font-semibold text-on-background pt-2"
                }
              >
                {block.text}
              </Tag>
            );
          }
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag
                key={index}
                className={`ml-5 space-y-2 text-zinc-100/80 ${
                  block.ordered ? "list-decimal" : "list-disc"
                }`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ListTag>
            );
          }
          case "table":
            return (
              <div key={index} className="overflow-x-auto rounded-xl border border-outline-variant/20">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-container">
                    <tr>
                      {block.headers.map((header) => (
                        <th key={header} className="px-4 py-3 font-label-bold font-semibold text-on-background">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-outline-variant/10">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-4 py-3 text-zinc-100/80">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "callout":
            return (
              <div
                key={index}
                className="rounded-xl border border-primary/30 bg-primary/10 px-5 py-4 text-sm text-on-background"
              >
                {block.text}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
