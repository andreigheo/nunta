import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Confidențialitate",
  description:
    "Principiile de confidențialitate Sarbato: cine vede datele evenimentului, cum sunt protejate și ce control ai asupra lor.",
};

const sections = [
  {
    title: "Despre acest document",
    body: [
      "Acest document descrie felul în care Sarbato tratează datele pe baza implementării curente și necesită revizuire juridică înainte să devină document contractual.",
    ],
  },
  {
    title: "Ce date prelucrăm",
    body: [
      "Date de cont: adresa de email și parola, stocată numai ca hash securizat. Sesiunile folosesc cookie-uri HttpOnly.",
      "Datele nunții: informațiile pe care le introduci despre eveniment, buget, furnizori, contracte și documente.",
      "Date despre invitați: nume, detalii de contact, preferințe de meniu și alergii. Alergiile și datele sensibile sunt criptate și vizibile doar prin fluxurile autorizate.",
      "Date despre furnizori: profiluri, servicii, oferte, contracte și evidențe comerciale.",
    ],
  },
  {
    title: "Cine vede datele",
    body: [
      "Accesul se face pe roluri — cuplu, partener, planner, familie, vizualizare — cu permisiuni pe module, verificate pe server.",
      "Invitații primesc un link securizat sau un cod QR, cu vizibilitate doar asupra propriei familii. Linkul poate fi revocat, iar tokenurile nu sunt stocate în clar.",
      "Furnizorii văd doar cererile, ofertele, rezervările și contractele care îi privesc.",
      "Fiecare nuntă și fiecare organizație de furnizor sunt izolate la nivel de bază de date.",
    ],
  },
  {
    title: "Plăți și semnături",
    body: [
      "Sarbato nu încasează și nu transferă plățile dintre organizatori și furnizori. Plățile se fac direct prin metoda stabilită între părți.",
      "Semnătura electronică este realizată prin furnizorul configurat, iar nivelul juridic afișat provine exclusiv din evidența furnizorului respectiv.",
    ],
  },
  {
    title: "Controlul tău",
    body: [
      "Listele, bugetul, planul de mese, contractele și istoricul activității se pot exporta în formate deschise.",
      "Operațiunile importante sunt înregistrate într-un jurnal de audit ce nu poate fi rescris.",
      "Acțiunile sensibile — aplicarea planului, acceptarea unei oferte, publicarea invitației — cer confirmare explicită.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <Section className="py-14 sm:py-18">
      <div className="max-w-3xl">
        <h1 className="marketing-heading text-[clamp(2.5rem,4vw,4.25rem)] font-semibold leading-[1.01] tracking-[-0.04em] text-brand text-balance">
          Confidențialitate
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
