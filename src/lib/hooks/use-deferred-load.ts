"use client";

import * as React from "react";

export function useDeferredLoad(load: () => void | Promise<void>) {
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
}
