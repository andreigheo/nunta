import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Termeni",
  description:
    "Termenii de utilizare Sarbato: stadiul produsului, contul, plățile, semnăturile și limitele funcțiilor AI.",
};

const sections = [
  {
    title: "Despre acest document",
    body: [
      "Acești termeni descriu utilizarea Sarbato pe baza implementării curente și necesită revizuire juridică înainte să devină document contractual.",
    ],
  },
  {
    title: "Stadiul produsului",
    body: [
      "Capabilitățile marcate în produs și pe site ca „în dezvoltare” sau „planificat” pot fi modificate, amânate sau retrase. Nu prezentăm funcții planificate ca fiind disponibile.",
      "În această etapă nu oferim garanții de disponibilitate sau termene de răspuns pentru suport.",
    ],
  },
  {
    title: "Contul tău",
    body: [
      "Ești responsabil de păstrarea confidențialității acreditărilor și de activitatea din contul tău.",
      "Datele pe care le introduci rămân ale tale. Le poți exporta oricând în formate deschise.",
    ],
  },
  {
    title: "Plăți, contracte și semnături",
    body: [
      "Sarbato nu încasează și nu transferă plățile dintre organizatori și furnizori. Plata se face direct prin metoda stabilită între părți.",
      "Confirmările operaționale din platformă nu pretind valoare juridică universală. Pentru semnătura electronică, nivelul juridic este cel raportat de furnizorul configurat.",
    ],
  },
  {
    title: "Funcțiile AI",
    body: [
      "AI-ul pregătește propuneri și drafturi explicate. Nicio rezervare, plată sau comunicare externă nu se face fără confirmarea ta.",
      "Analiza contractuală este informativă și nu constituie consultanță juridică. Estimările financiare sunt orientative.",
    ],
  },
  {
    title: "Furnizori",
    body: [
      "Conturile de furnizor se activează prin invitație. Profilurile publice apar în marketplace doar după publicare explicită, iar recenziile sunt moderate de echipa platformei.",
    ],
  },
];

export default function TermsPage() {
  return (
    <Section className="py-14 sm:py-18">
      <div className="max-w-3xl">
        <h1 className="marketing-heading text-[clamp(2.5rem,4vw,4.25rem)] font-semibold leading-[1.01] tracking-[-0.04em] text-brand text-balance">
          Termeni de utilizare
        </h1>
        <p className="mt-3 text-base leading-[1.625] text-muted">
          Document informativ curent. Actualizat la 20 iulie 2026.
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
      </div>
    </Section>
  );
}
