import { AppShell } from "@/components/shell/app-shell";

export default function CoupleAppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
