import { Suspense } from "react";
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
          <div className="min-h-screen bg-canvas p-8 text-sm text-muted">
            Se încarcă Vendor OS…
          </div>
        }
      >
        {children}
      </Suspense>
    </WorkspaceProvider>
  );
}
