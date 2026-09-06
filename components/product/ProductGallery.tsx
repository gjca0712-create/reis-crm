"use client";

import { useState } from "react";
import Image from "next/image";

export default function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const hasMultiple = images.length > 1;

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-surface-container">
        <Image src={images[active]} alt={alt} fill className="object-cover" priority />
      </div>
      {hasMultiple && (
        <div className="mt-3 flex gap-2">
          {images.map((src, index) => (
            <button
              key={src + index}
              type="button"
              onClick={() => setActive(index)}
              className={`relative h-16 w-16 overflow-hidden rounded-lg border-2 transition-colors ${
                active === index ? "border-primary" : "border-transparent"
              }`}
            >
              <Image src={src} alt="" fill className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
