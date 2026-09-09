import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Politica de rambursare",
  description:
    "Anularea abonamentelor Sarbato, dreptul de retragere și solicitarea rambursărilor procesate prin Paddle.",
};

const sections = [
  {
    title: "Domeniul politicii",
    body: [
      "Această politică se aplică abonamentelor Sarbato Plus și Sarbato Pro cumpărate prin Paddle. Sarbato este operat de Andrei Vilcu, vânzător individual, sub brandul Sarbato.",
      "Paddle este Merchant of Record pentru aceste tranzacții și gestionează plata, taxele, documentele de plată, anularea și rambursarea.",
    ],
  },
  {
    title: "Anularea abonamentului",
    body: [
      "Poți anula abonamentul oricând din portalul clientului indicat în emailul de confirmare Paddle sau din setările de facturare Sarbato.",
      "Anularea intră în vigoare la sfârșitul perioadei de facturare curente. Nu vei mai fi taxat pentru o perioadă nouă, iar accesul plătit rămâne disponibil până la data expirării afișată.",
    ],
  },
  {
    title: "Dreptul de retragere și drepturile obligatorii",
    body: [
      "Consumatorii din Uniunea Europeană, Spațiul Economic European și Regatul Unit pot avea dreptul de a se retrage în termen de 14 zile de la tranzacție, conform legii aplicabile și condițiilor Paddle pentru cumpărători.",
      "Începerea furnizării serviciului digital în perioada de retragere poate afecta acest drept numai în condițiile permise de lege și pe baza acordurilor cerute în checkout.",
      "Nicio prevedere din această politică nu limitează drepturile obligatorii privind conformitatea serviciilor digitale, rambursarea sau protecția consumatorului.",
    ],
  },
  {
    title: "Defecte și indisponibilitate materială",
    body: [
      "Dacă o problemă tehnică persistentă împiedică accesul la funcțiile cumpărate, contactează-ne la hello@sarbato.space pentru diagnosticare. Include adresa contului, numărul tranzacției și o descriere a problemei, fără parole sau date de card.",
      "Dacă problema nu poate fi remediată într-un termen rezonabil, vom colabora cu Paddle pentru rambursarea integrală sau parțială datorată potrivit legii și politicilor aplicabile.",
    ],
  },
  {
    title: "Cum soliciți o rambursare",
    body: [
      "Solicitările de rambursare se transmit prin portalul de asistență pentru cumpărători Paddle la paddle.net. Ne poți contacta și la hello@sarbato.space pentru informațiile despre produs necesare soluționării cererii.",
      "Rambursările aprobate sunt emise de Paddle către metoda de plată folosită la cumpărare. Sarbato nu solicită și nu procesează direct datele cardului.",
      "Decizia și durata procesării depind de drepturile legale aplicabile, motivul solicitării, utilizarea serviciului și regulile Paddle. Rambursările discreționare sunt evaluate individual.",
    ],
  },
  {
    title: "Ce nu acoperă această politică",
    body: [
      "Această politică nu se aplică plăților dintre organizatorii evenimentului și furnizorii lor. Sarbato nu intermediază, nu încasează și nu transferă astfel de plăți.",
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <Section className="py-14 sm:py-18">
      <div className="max-w-3xl">
        <h1 className="marketing-heading text-[clamp(2.5rem,4vw,4.25rem)] font-semibold leading-[1.01] tracking-[-0.04em] text-brand text-balance">
          Politica de rambursare
        </h1>
        <p className="mt-3 text-base leading-[1.625] text-muted">
          În vigoare de la 1 august 2026.
        </p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
                {section.title}
              </h2>
              <div className="mt-2.5 space-y-2.5">
                {section.body.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="max-w-[72ch] text-base leading-[1.625] text-muted"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 text-sm leading-6 text-muted">
          Vezi și{" "}
          <Link href="/termeni" className="font-medium text-brand underline-offset-4 hover:underline">
            Termenii de utilizare
          </Link>{" "}
          și{" "}
          <Link
            href="/confidentialitate"
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            Politica de confidențialitate
          </Link>
          .
        </p>
      </div>
    </Section>
  );
}
