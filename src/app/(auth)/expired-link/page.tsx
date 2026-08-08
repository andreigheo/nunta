"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TimerOff } from "lucide-react";
import { Button } from "@/components/ui";
import { AuthHeading } from "@/components/auth/auth-bits";

export default function ExpiredLinkPage() {
  const router = useRouter();
  return (
    <div className="text-center">
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        <TimerOff className="size-7" aria-hidden />
      </span>
      <AuthHeading
        title="Acest link a expirat"
        subtitle="Din motive de securitate, linkurile magice și cele de resetare sunt valabile doar 15–30 de minute."
      />
      <div className="space-y-2.5">
        <Button size="lg" className="w-full" onClick={() => router.push("/sign-in")}>
          Trimite un link nou
        </Button>
        <Link href="/forgot-password" className="block">
          <Button variant="ghost" size="lg" className="w-full">Resetează parola în schimb</Button>
        </Link>
      </div>
    </div>
  );
}
