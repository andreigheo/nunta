"use client";

import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui";
import { AuthHeading } from "@/components/auth/auth-bits";

export default function AccessDeniedPage() {
  return (
    <div className="text-center">
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <ShieldX className="size-7" aria-hidden />
      </span>
      <AuthHeading
        title="Acces restricționat"
        subtitle="Nu ai permisiunea de a vedea această pagină. Cere proprietarului spațiului de lucru să-ți extindă accesul."
      />
      <div className="space-y-2.5">
        <Link href="/overview" className="block">
          <Button size="lg" className="w-full">Înapoi la prezentare generală</Button>
        </Link>
        <Link href="/sign-in" className="block">
          <Button variant="ghost" size="lg" className="w-full">Schimbă contul</Button>
        </Link>
      </div>
    </div>
  );
}
