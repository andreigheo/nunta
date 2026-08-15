"use client";

import * as React from "react";

export function useDeferredLoad(load: () => void | Promise<void>) {
  React.useEffect(() => {
    let timer: number | null = window.setTimeout(() => {
      timer = null;
      void load();
    }, 0);
    const reload = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void load();
      }, 0);
    };
    window.addEventListener("weddingos:planning-changed", reload);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("weddingos:planning-changed", reload);
    };
  }, [load]);
}
