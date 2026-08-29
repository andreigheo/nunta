"use client";

import { useEffect, useId, useRef, useState } from "react";

import styles from "./product-first-control-room.module.css";

type Point = { x: number; y: number };

type ThreadPath = {
  d: string;
  cornerDepth: number;
  from: "plum" | "sun";
  to: "sage";
  transition: number;
  feather: number;
  mirrored: boolean;
};

type ThreadGeometry = {
  width: number;
  height: number;
  paths: ThreadPath[];
};

const toneClasses = {
  plum: styles.tonePlum,
  sage: styles.toneSage,
  sun: styles.toneSun,
} as const;

function roundedPairPath({
  firstNode,
  secondNode,
  left,
  right,
  firstFloor,
  secondFloor,
  mirrored = false,
}: {
  firstNode: Point;
  secondNode: Point;
  left: number;
  right: number;
  firstFloor: number;
  secondFloor: number;
  mirrored?: boolean;
}) {
  const projectX = (value: number) =>
    mirrored ? left + right - value : value;
  const firstNodeX = projectX(firstNode.x);
  const secondNodeX = projectX(secondNode.x);
  const startRadius = Math.min(26, Math.max(18, firstNodeX - left));
  const leftRadius = Math.min(62, Math.max(44, (right - left) * 0.25));
  const rightRadius = leftRadius * 0.9;
  const signatureRadius = leftRadius * 0.94;
  const firstRun = right - left - leftRadius - rightRadius;
  const secondRun = right - left - leftRadius - signatureRadius;
  const signatureRise = Math.min(27, Math.max(20, leftRadius * 0.38));
  const cornerDepth = Math.min(8, Math.max(6, signatureRadius * 0.115));

  const d = [
    `M ${projectX(firstNodeX)} ${firstNode.y}`,
    `C ${projectX(firstNodeX - startRadius * 0.55)} ${
      firstNode.y
    } ${projectX(left)} ${firstNode.y + startRadius * 0.42} ${projectX(
      left,
    )} ${firstNode.y + startRadius}`,
    `V ${firstFloor - leftRadius}`,
    `C ${projectX(left)} ${firstFloor - leftRadius * 0.33} ${projectX(
      left + leftRadius * 0.35,
    )} ${firstFloor} ${projectX(left + leftRadius)} ${firstFloor}`,
    `C ${projectX(left + leftRadius + firstRun * 0.3)} ${
      firstFloor + 0.7
    } ${projectX(right - rightRadius - firstRun * 0.3)} ${
      firstFloor - 1.1
    } ${projectX(right - rightRadius)} ${firstFloor}`,
    `C ${projectX(right - rightRadius * 0.33)} ${firstFloor} ${projectX(
      right,
    )} ${firstFloor + rightRadius * 0.35} ${projectX(right)} ${
      firstFloor + rightRadius
    }`,
    `V ${secondFloor - signatureRise}`,
    `C ${projectX(right)} ${secondFloor - signatureRise * 0.32} ${projectX(
      right - signatureRadius * 0.1,
    )} ${secondFloor + cornerDepth * 0.58} ${projectX(
      right - signatureRadius * 0.32,
    )} ${secondFloor + cornerDepth}`,
    `C ${projectX(right - signatureRadius * 0.55)} ${
      secondFloor + cornerDepth * 1.14
    } ${projectX(right - signatureRadius * 0.74)} ${secondFloor} ${projectX(
      right - signatureRadius,
    )} ${secondFloor}`,
    `C ${projectX(right - signatureRadius - secondRun * 0.3)} ${
      secondFloor + 1.1
    } ${projectX(left + leftRadius + secondRun * 0.3)} ${
      secondFloor - 0.7
    } ${projectX(left + leftRadius)} ${secondFloor}`,
    `C ${projectX(left + leftRadius * 0.35)} ${secondFloor} ${projectX(
      left,
    )} ${secondFloor - leftRadius * 0.33} ${projectX(left)} ${
      secondFloor - leftRadius
    }`,
    `V ${secondNode.y + startRadius}`,
    `C ${projectX(left)} ${secondNode.y + startRadius * 0.42} ${projectX(
      secondNodeX - startRadius * 0.55,
    )} ${secondNode.y} ${projectX(secondNodeX)} ${secondNode.y}`,
  ].join(" ");

  return { d, cornerDepth };
}

export function StoryThreads() {
  const layerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<ThreadGeometry | null>(null);
  const gradientPrefix = useId().replaceAll(":", "");

  useEffect(() => {
    const layer = layerRef.current;
    const stack = layer?.parentElement;
    if (!layer || !stack) return;

    const measure = () => {
      const stackRect = stack.getBoundingClientRect();
      const stories = Array.from(
        stack.querySelectorAll<HTMLElement>("[data-story-section]"),
      );

      if (stories.length !== 4 || stackRect.width <= 0) return;

      const items = stories.map((story) => {
        const copy = story.querySelector<HTMLElement>("[data-story-copy]");
        const node = story.querySelector<HTMLElement>("[data-story-node]");
        if (!copy || !node) return null;

        const storyRect = story.getBoundingClientRect();
        const copyRect = copy.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        return {
          storyBottom: storyRect.bottom - stackRect.top,
          copyLeft: copyRect.left - stackRect.left,
          copyRight: copyRect.right - stackRect.left,
          mirrored: story.dataset.storyLayout === "reverse",
          node: {
            x: nodeRect.left + nodeRect.width / 2 - stackRect.left,
            y: nodeRect.top + nodeRect.height / 2 - stackRect.top,
          },
        };
      });

      if (items.some((item) => item === null)) return;
      const measured = items as NonNullable<(typeof items)[number]>[];
      const paths: ThreadPath[] = [];
      for (let pairStart = 0; pairStart < measured.length; pairStart += 2) {
        const first = measured[pairStart];
        const second = measured[pairStart + 1];
        const mirrored = first.mirrored && second.mirrored;
        const join = first.storyBottom + 28;
        const left =
          Math.min(first.copyLeft, second.copyLeft) - (mirrored ? 5 : 16);
        const right =
          Math.max(first.copyRight, second.copyRight) + (mirrored ? 16 : 5);
        const secondFloor = second.storyBottom - 18;
        const gradientSpan = Math.max(1, secondFloor - first.node.y);

        const shape = roundedPairPath({
            firstNode: first.node,
            secondNode: second.node,
            left,
            right,
            firstFloor: first.storyBottom + 4,
            secondFloor,
            mirrored,
          });

        paths.push({
          d: shape.d,
          cornerDepth: shape.cornerDepth,
          from: pairStart === 0 ? "plum" : "sun",
          to: "sage",
          transition: (join - first.node.y) / gradientSpan,
          feather: Math.min(0.09, Math.max(0.045, 44 / gradientSpan)),
          mirrored,
        });
      }

      setGeometry({
        width: stackRect.width,
        height: stackRect.height,
        paths,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stack);
    stack
      .querySelectorAll<HTMLElement>("[data-story-section], [data-story-copy]")
      .forEach((element) => observer.observe(element));
    document.fonts?.ready.then(measure).catch(() => undefined);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={layerRef} className={styles.storyThreadLayer} aria-hidden>
      {geometry ? (
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          preserveAspectRatio="none"
          data-testid="story-thread-layer"
        >
          <defs>
            {geometry.paths.map((path, index) => {
              const gradientId = `${gradientPrefix}-story-thread-${index}`;
              const transition = Math.min(0.96, Math.max(0.04, path.transition));
              const feather = path.feather;
              return (
                <linearGradient
                  key={gradientId}
                  id={gradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                  gradientUnits="objectBoundingBox"
                >
                  <stop offset="0" className={toneClasses[path.from]} />
                  <stop
                    offset={Math.max(0, transition - feather)}
                    className={toneClasses[path.from]}
                  />
                  <stop
                    offset={Math.min(1, transition + feather)}
                    className={toneClasses[path.to]}
                  />
                  <stop offset="1" className={toneClasses[path.to]} />
                </linearGradient>
              );
            })}
          </defs>
          {geometry.paths.map((path, index) => (
            <path
              key={index}
              className={styles.storyPath}
              d={path.d}
              stroke={`url(#${gradientPrefix}-story-thread-${index})`}
              data-story-pair={index}
              data-mirrored={path.mirrored ? "true" : "false"}
              data-corner-depth={path.cornerDepth.toFixed(2)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      ) : null}
    </div>
  );
}
