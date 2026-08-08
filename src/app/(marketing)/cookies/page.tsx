import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Politica privind cookie-urile",
  description:
    "Categoriile de cookie-uri folosite de Sarbato și modul de administrare a opțiunilor.",
};

const sections = [
  [
    "Versiune și statut",
    "Versiune informativă 2026-07-21, în limba română. Conținutul necesită revizuire juridică înainte să devină document contractual.",
  ],
  [
    "Cookie-uri esențiale",
    "Sunt folosite pentru sesiunea autentificată, protecția contului și preferințele necesare funcționării serviciului.",
  ],
  [
    "Preferințe",
    "Pot păstra opțiuni neesențiale ale interfeței. Categoria este dezactivată implicit și poate fi modificată din Privacy Center.",
  ],
  [
    "Analytics",
    "Categoria este dezactivată implicit. Sarbato nu încarcă un furnizor analytics opțional înaintea acordului explicit.",
  ],
  [
    "Marketing",
    "Categoria este dezactivată implicit. Orice acord poate fi retras, iar istoricul deciziei este păstrat conform politicii de retenție.",
  ],
  [
    "Controlul tău",
    "Utilizatorii autentificați pot schimba opțiunile în Setări → Confidențialitate. Vizitatorii publici pot refuza categoriile opționale fără a pierde accesul la conținutul public.",
  ],
];

export default function CookiesPage() {
  return (
    <Section className="py-14 sm:py-18">
      <div className="max-w-3xl">
        <h1 className="marketing-heading text-[clamp(2.5rem,4vw,4.25rem)] font-semibold leading-[1.01] tracking-[-0.04em] text-brand text-balance">
          Politica privind cookie-urile
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">
          Document informativ curent. Actualizat la 21 iulie 2026.
        </p>
        <div className="mt-10 space-y-8">
          {sections.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-xl font-semibold text-ink">{title}</h2>
              <p className="mt-2.5 max-w-[72ch] text-base leading-relaxed text-muted">
                {body}
              </p>
            </section>
          ))}
        </div>
        <a
          className="mt-10 inline-flex text-sm font-medium text-brand hover:underline"
          href="/settings?tab=privacy"
        >
          Administrează preferințele în Privacy Center
        </a>
      </div>
    </Section>
  );
}
