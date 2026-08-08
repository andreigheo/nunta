import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Confidențialitate",
  description:
    "Politica de confidențialitate Sarbato și modul în care sunt prelucrate datele personale.",
};

const sections = [
  {
    title: "Cine răspunde pentru date",
    body: [
      "Sarbato este operat de Andrei Vilcu, vânzător individual, sub brandul Sarbato. Pentru întrebări sau cereri privind datele personale ne poți contacta la andreivilcuro@gmail.com.",
      "Această politică se aplică site-ului sarbato.space, conturilor Sarbato și funcțiilor platformei.",
    ],
  },
  {
    title: "Ce date prelucrăm",
    body: [
      "Date de cont: adresa de email și parola, stocată numai ca hash securizat. Sesiunile folosesc cookie-uri HttpOnly.",
      "Date de utilizare și securitate: adrese IP, dispozitiv, autentificări, acțiuni auditate, erori și preferințe tehnice.",
      "Datele evenimentului: informațiile pe care le introduci despre plan, buget, furnizori, contracte și documente.",
      "Date despre invitați: nume, detalii de contact, preferințe de meniu și alergii. Alergiile și datele sensibile sunt criptate și vizibile doar prin fluxurile autorizate.",
      "Date despre furnizori: profiluri, servicii, oferte, contracte și evidențe comerciale.",
    ],
  },
  {
    title: "De ce și în baza cărui temei le folosim",
    body: [
      "Prelucrăm datele pentru a crea și administra contul, a furniza funcțiile solicitate și a executa contractul cu utilizatorul.",
      "Folosim datele necesare pentru securitate, prevenirea abuzului, jurnalizare, suport și îmbunătățirea fiabilității pe baza interesului nostru legitim, fără a prevala asupra drepturilor persoanei.",
      "Prelucrăm date pentru obligații legale, fiscale și de protecție a consumatorilor. Comunicările opționale sunt trimise pe baza consimțământului, care poate fi retras.",
      "Datele sensibile despre invitați, precum alergiile, trebuie introduse numai cu un temei legal adecvat și sunt folosite exclusiv pentru funcția solicitată.",
    ],
  },
  {
    title: "Cine poate primi datele",
    body: [
      "Accesul în workspace este acordat pe roluri și verificat pe server. Invitații, colaboratorii și furnizorii văd numai datele necesare fluxului în care participă.",
      "Folosim furnizori pentru infrastructură, stocare, email, securitate și funcționarea produsului. Aceștia prelucrează date numai potrivit instrucțiunilor și contractelor aplicabile.",
      "Paddle este Merchant of Record pentru abonamentele plătite și prelucrează separat datele de checkout, plată, facturare, taxe, anulare și rambursare conform propriei politici de confidențialitate.",
      "Nu vindem date personale. Putem divulga informații când legea o impune sau pentru protejarea drepturilor, utilizatorilor și securității serviciului.",
    ],
  },
  {
    title: "Păstrare, transferuri și securitate",
    body: [
      "Păstrăm datele cât timp contul este activ și ulterior atât cât este necesar pentru obligații legale, securitate, soluționarea disputelor și copii de siguranță. Datele care nu mai sunt necesare sunt șterse sau anonimizate.",
      "Dacă un furnizor prelucrează date în afara Spațiului Economic European, folosim mecanisme legale adecvate, precum decizii de adecvare sau clauze contractuale standard.",
      "Aplicăm măsuri tehnice și organizatorice precum criptare, control pe roluri, jurnalizare și copii de siguranță. Niciun sistem nu poate garanta securitate absolută.",
    ],
  },
  {
    title: "Drepturile tale",
    body: [
      "Poți solicita accesul, corectarea, ștergerea, restricționarea sau portabilitatea datelor și te poți opune anumitor prelucrări. Atunci când prelucrarea se bazează pe consimțământ, îl poți retrage pentru viitor.",
      "Pentru o cerere, scrie la andreivilcuro@gmail.com. Este posibil să cerem informații rezonabile pentru verificarea identității și vom răspunde în termenul prevăzut de lege.",
      "Ai dreptul să depui o plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal sau la autoritatea competentă din țara ta.",
    ],
  },
  {
    title: "Cookie-uri și actualizări",
    body: [
      "Folosim cookie-uri strict necesare pentru autentificare, securitate și preferințe. Orice cookie opțional va necesita alegerea utilizatorului acolo unde legea o cere.",
      "Putem actualiza această politică atunci când serviciul sau obligațiile legale se schimbă. Data versiunii curente este afișată mai jos, iar schimbările materiale vor fi comunicate atunci când este necesar.",
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
      </div>
    </Section>
  );
}
