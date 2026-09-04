"use client";

import { useLayoutEffect, useRef, useState } from "react";
import styles from "./product-page.module.css";

type ThreadGeometry = {
  width: number;
  height: number;
  path: string;
  endX: number;
  endY: number;
};

export function ProductHeroThread() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = useState<ThreadGeometry | null>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const hero = svg?.closest<HTMLElement>("[data-product-hero]");
    const start = hero?.querySelector<HTMLElement>("[data-hero-thread-start]");
    const system = hero?.querySelector<HTMLElement>("[data-hero-thread-system]");
    const firstCard = hero?.querySelector<HTMLElement>("[data-hero-thread-card]");

    if (!hero || !start || !system || !firstCard) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.matchMedia("(max-width: 1000px)").matches) {
          setGeometry(null);
          return;
        }

        const heroRect = hero.getBoundingClientRect();
        const startRect = start.getBoundingClientRect();
        const systemRect = system.getBoundingClientRect();
        const cardRect = firstCard.getBoundingClientRect();
        const width = heroRect.width;
        const height = heroRect.height;
        const startX = startRect.left + startRect.width * 0.5 - heroRect.left;
        const startY = startRect.bottom - heroRect.top;
        const endX = systemRect.left - heroRect.left;
        const endY = cardRect.top + cardRect.height * 0.58 - heroRect.top;
        const drop = Math.max(38, Math.min(52, width * 0.042));
        const baselineY = Math.min(height - 18, startY + drop);
        const openingX = startX + Math.max(44, Math.min(68, width * 0.05));
        const verticalRise = Math.abs(baselineY - endY);
        const rise = Math.max(
          90,
          Math.min(180, Math.max(width * 0.09, verticalRise * 1.25)),
        );
        const curveX = Math.max(openingX + 24, endX - rise);
        const path = [
          `M${startX.toFixed(2)} ${startY.toFixed(2)}`,
          `V${(startY + drop * 0.38).toFixed(2)}`,
          `C${startX.toFixed(2)} ${(startY + drop * 0.82).toFixed(2)} `,
          `${(startX + drop * 0.2).toFixed(2)} ${baselineY.toFixed(2)} `,
          `${openingX.toFixed(2)} ${baselineY.toFixed(2)}`,
          `H${curveX.toFixed(2)}`,
          `C${(endX - rise * 0.68).toFixed(2)} ${baselineY.toFixed(2)} `,
          `${(endX - rise * 0.38).toFixed(2)} ${endY.toFixed(2)} `,
          `${endX.toFixed(2)} ${endY.toFixed(2)}`,
        ].join(" ");

        setGeometry({ width, height, path, endX, endY });
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(hero);
    observer.observe(start);
    observer.observe(system);
    observer.observe(firstCard);
    window.addEventListener("resize", update, { passive: true });
    void document.fonts.ready.then(update);
    update();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className={styles.heroThread}
      viewBox={geometry ? `0 0 ${geometry.width} ${geometry.height}` : "0 0 1 1"}
      preserveAspectRatio="none"
      aria-hidden
    >
      {geometry ? (
        <>
          <path className={styles.heroMainThread} d={geometry.path} />
          <circle
            className={styles.heroEntryNode}
            cx={geometry.endX}
            cy={geometry.endY}
            r="4.5"
          />
        </>
      ) : null}
    </svg>
  );
}
