import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { SarbatoMark } from "@/components/brand/sarbato-mark";
import { WorkspaceProvider } from "@/lib/api/workspace-context";

export default function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider allowNoWorkspace>
      <Suspense
        fallback={
          <main
            className="flex min-h-dvh items-center justify-center bg-background px-5 py-10"
            aria-busy="true"
          >
            <div className="w-full max-w-sm text-center">
              <SarbatoMark href="/" compact className="justify-center" />
              <div
                className="mt-8 rounded-2xl bg-surface p-6 shadow-card"
                role="status"
                aria-live="polite"
              >
                <span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-brand-soft text-brand-strong dark:text-brand">
                  <LoaderCircle
                    className="size-5 motion-safe:animate-spin"
                    aria-hidden
                  />
                </span>
                <h1 className="mt-5 font-brand text-2xl font-semibold tracking-[-0.02em] text-ink">
                  Pregătim spațiul furnizorului
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Se încarcă spațiul furnizorului…
                </p>
              </div>
            </div>
          </main>
        }
      >
        {children}
      </Suspense>
    </WorkspaceProvider>
  );
}
