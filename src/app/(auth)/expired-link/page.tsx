"use client";

import { TimerOff } from "lucide-react";
import { AuthActionLink, AuthHeading } from "@/components/auth/auth-bits";

export default function ExpiredLinkPage() {
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
        <AuthActionLink href="/sign-in">
          Trimite un link nou
        </AuthActionLink>
        <AuthActionLink href="/forgot-password" variant="ghost">Resetează parola în schimb</AuthActionLink>
      </div>
    </div>
  );
}
