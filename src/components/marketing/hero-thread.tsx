"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./product-first-control-room.module.css";

export function HeroThread() {
  const threadRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    const hero = thread?.closest<HTMLElement>("[data-hero-thread-space]");
    const start = hero?.querySelector<HTMLElement>("[data-hero-thread-start]");
    const end = hero?.querySelector<HTMLElement>("[data-hero-thread-end]");

    if (!thread || !hero || !start || !end) return;

    const update = () => {
      const heroRect = hero.getBoundingClientRect();
      const startRect = start.getBoundingClientRect();
      const endRect = end.getBoundingClientRect();
      const startX = startRect.left + startRect.width / 2 - heroRect.left;
      const endX = endRect.left - heroRect.left;

      thread.style.setProperty("--thread-left", `${startX}px`);
      thread.style.setProperty("--thread-top", `${startRect.bottom - heroRect.top}px`);
      thread.style.setProperty("--thread-width", `${Math.max(0, endX - startX)}px`);
      thread.dataset.ready = "true";
    };

    const observer = new ResizeObserver(update);
    observer.observe(hero);
    observer.observe(start);
    observer.observe(end);
    window.addEventListener("resize", update);
    void document.fonts.ready.then(update);
    update();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      ref={threadRef}
      className={styles.heroThread}
      data-testid="hero-thread"
      aria-hidden
    >
      <svg
        className={styles.heroThreadCurve}
        viewBox="0 0 260 82"
        preserveAspectRatio="none"
      >
        <path d="M0 0 C0 56 14 70 53 70 C124 70 202 14 260 14" />
      </svg>
      <span className={styles.heroThreadDot} />
    </div>
  );
}
