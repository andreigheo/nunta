"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./product-first-control-room.module.css";

const threadRetractMs = 420;

export function HeroThread() {
  const threadRef = useRef<HTMLDivElement>(null);
  const chargeRef = useRef<SVGSVGElement>(null);
  const chargePathRef = useRef<SVGPathElement>(null);
  const chargeEndRef = useRef<SVGCircleElement>(null);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    const hero = thread?.closest<HTMLElement>("[data-hero-thread-space]");
    const start = hero?.querySelector<HTMLElement>("[data-hero-thread-start]");
    const end = hero?.querySelector<HTMLElement>("[data-hero-thread-end]");
    const chargeSvg = chargeRef.current;
    const chargePath = chargePathRef.current;
    const chargeEnd = chargeEndRef.current;

    if (
      !thread ||
      !hero ||
      !start ||
      !end ||
      !chargeSvg ||
      !chargePath ||
      !chargeEnd
    )
      return;

    let measureFrame: number | null = null;
    let chargeFrame: number | null = null;
    let retractTimer: number | null = null;
    let active = true;

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

      if (end.dataset.showcaseView === "returning") return;

      if (end.dataset.showcaseView !== "invitation") {
        thread.dataset.charging = "false";
        return;
      }

      const charge = end.querySelector<HTMLElement>("[data-hero-thread-charge]");
      if (!charge) {
        thread.dataset.charging = "false";
        return;
      }

      const chargeRect = charge.getBoundingClientRect();
      const baseEndY = (thread.getBoundingClientRect().height * 14) / 82;
      const targetX =
        chargeRect.left + chargeRect.width / 2 - heroRect.left - endX;
      const targetY =
        chargeRect.top + chargeRect.height / 2 - heroRect.top -
        (startRect.bottom - heroRect.top) -
        baseEndY;

      if (targetX <= 0 || targetY <= 0) {
        thread.dataset.charging = "false";
        return;
      }

      const underRun = Math.min(24, Math.max(14, targetY * 0.22));
      const floorY = targetY + underRun;
      const curveWidth = Math.max(1, targetX);
      const curveHeight = Math.max(1, floorY + 2);
      const firstTurnX = Math.min(curveWidth * 0.42, 118);
      const approachX = Math.max(firstTurnX + 12, curveWidth - 34);
      const path = [
        "M 0 0",
        `C ${firstTurnX * 0.42} 0 ${firstTurnX * 0.38} ${floorY} ${firstTurnX} ${floorY}`,
        `L ${approachX} ${floorY}`,
        `C ${curveWidth - 9} ${floorY} ${curveWidth} ${targetY + 10} ${curveWidth} ${targetY}`,
      ].join(" ");

      chargeSvg.style.left = `${endX - startX}px`;
      chargeSvg.style.top = `${baseEndY}px`;
      chargeSvg.style.width = `${curveWidth}px`;
      chargeSvg.style.height = `${curveHeight}px`;
      chargeSvg.setAttribute("viewBox", `0 0 ${curveWidth} ${curveHeight}`);
      chargePath.setAttribute("d", path);
      chargeEnd.setAttribute("cx", `${curveWidth}`);
      chargeEnd.setAttribute("cy", `${targetY}`);
      const pathLength = chargePath.getTotalLength();
      chargeSvg.style.setProperty("--thread-charge-length", `${pathLength}`);

      if (thread.dataset.charging !== "true") {
        thread.dataset.charging = "prepared";
        chargeFrame = window.requestAnimationFrame(() => {
          if (active) thread.dataset.charging = "true";
        });
      }
    };

    const measureSettledInvitation = () => {
      if (measureFrame !== null) window.cancelAnimationFrame(measureFrame);
      if (chargeFrame !== null) window.cancelAnimationFrame(chargeFrame);
      if (retractTimer !== null) window.clearTimeout(retractTimer);

      if (end.dataset.showcaseView === "returning") {
        thread.dataset.charging = "retracting";
        retractTimer = window.setTimeout(() => {
          if (active) thread.dataset.charging = "false";
        }, threadRetractMs);
        return;
      }

      thread.dataset.charging = "false";
      measureFrame = window.requestAnimationFrame(() => {
        measureFrame = window.requestAnimationFrame(update);
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(hero);
    observer.observe(start);
    observer.observe(end);
    const mutationObserver = new MutationObserver(measureSettledInvitation);
    mutationObserver.observe(end, {
      attributes: true,
      attributeFilter: ["data-showcase-view"],
    });
    window.addEventListener("resize", update);
    void document.fonts.ready.then(() => {
      if (active) update();
    });
    update();

    return () => {
      active = false;
      if (measureFrame !== null) window.cancelAnimationFrame(measureFrame);
      if (chargeFrame !== null) window.cancelAnimationFrame(chargeFrame);
      if (retractTimer !== null) window.clearTimeout(retractTimer);
      observer.disconnect();
      mutationObserver.disconnect();
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
      <svg
        ref={chargeRef}
        className={styles.heroThreadCharge}
        preserveAspectRatio="none"
        aria-hidden
      >
        <path ref={chargePathRef} className={styles.heroThreadChargePath} />
        <circle
          ref={chargeEndRef}
          className={styles.heroThreadChargeEnd}
          r="4.5"
        />
      </svg>
    </div>
  );
}
