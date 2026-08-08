import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Termeni de utilizare",
  description:
    "Termenii care guvernează utilizarea platformei Sarbato și a abonamentelor sale.",
};

const sections = [
  {
    title: "Operatorul serviciului",
    body: [
      "Sarbato este un serviciu software operat de Andrei Vilcu, vânzător individual, sub brandul Sarbato. Ne poți contacta la andreivilcuro@gmail.com.",
      "Prin crearea unui cont sau folosirea serviciului accepți acești termeni. Dacă folosești Sarbato în numele altor persoane, confirmi că ai permisiunea necesară.",
    ],
  },
  {
    title: "Serviciul Sarbato",
    body: [
      "Sarbato este o platformă SaaS pentru planificarea nunților și a altor evenimente de familie. Funcțiile disponibile pot include planificare, invitații, RSVP, buget, furnizori, documente și coordonarea zilei evenimentului.",
      "Funcțiile marcate ca planificate, beta sau în dezvoltare nu fac parte din abonamentul cumpărat până când nu sunt activate explicit.",
    ],
  },
  {
    title: "Contul tău",
    body: [
      "Ești responsabil de păstrarea confidențialității acreditărilor și de activitatea din contul tău.",
      "Trebuie să furnizezi informații corecte, să folosești serviciul legal și să ai dreptul de a introduce datele invitaților, colaboratorilor și furnizorilor.",
      "Nu poți încerca să accesezi alte conturi, să ocolești limitele planului, să încarci conținut ilegal sau să afectezi securitatea și funcționarea platformei.",
    ],
  },
  {
    title: "Abonamente și facturare",
    body: [
      "Planul gratuit nu necesită card. Planurile Plus și Pro sunt abonamente lunare care se reînnoiesc automat până la anulare. Prețul și taxele aplicabile sunt afișate înainte de confirmarea comenzii.",
      "Paddle este Merchant of Record și gestionează checkout-ul, încasarea, taxele, documentele de plată, anulările și rambursările pentru abonamentele plătite Sarbato.",
      "Poți anula abonamentul oricând din portalul clientului. Anularea produce efecte la sfârșitul perioadei de facturare curente și oprește taxările viitoare, fără a șterge automat contul.",
      "Condițiile privind retragerea și rambursările sunt descrise în Politica de rambursare.",
    ],
  },
  {
    title: "Plățile către furnizorii evenimentului",
    body: [
      "Abonamentele Sarbato sunt separate de relațiile comerciale dintre organizatori și furnizorii evenimentului. Sarbato nu încasează, nu păstrează și nu transferă bani între aceste părți.",
      "Ofertele, confirmările, bugetele și evidențele din platformă au rol operațional. Plata unui furnizor se face direct prin metoda stabilită între părți.",
    ],
  },
  {
    title: "Funcțiile AI și informațiile profesionale",
    body: [
      "Funcțiile AI pot pregăti propuneri, rezumate și estimări. Rezultatele pot conține erori și trebuie verificate înainte de folosire.",
      "Sarbato nu oferă consultanță juridică, financiară sau fiscală. Deciziile, contractele, mesajele și acțiunile externe rămân responsabilitatea utilizatorului.",
    ],
  },
  {
    title: "Disponibilitate și modificări",
    body: [
      "Depunem eforturi rezonabile pentru disponibilitatea și securitatea serviciului, însă mentenanța, incidentele sau furnizorii externi pot produce întreruperi temporare.",
      "Putem modifica serviciul și acești termeni pentru motive legale, de securitate sau de produs. Pentru schimbările materiale care afectează un abonament plătit vom furniza o notificare rezonabilă atunci când legea o cere.",
    ],
  },
  {
    title: "Suspendare, încetare și răspundere",
    body: [
      "Putem suspenda sau închide accesul pentru încălcări grave sau repetate, fraudă, abuz ori risc de securitate. Utilizatorul poate înceta folosirea serviciului și poate solicita ștergerea contului conform politicii de confidențialitate.",
      "În limita permisă de lege, Sarbato nu răspunde pentru pierderi indirecte, decizii luate pe baza estimărilor, neexecutarea obligațiilor unui furnizor sau evenimente aflate în afara controlului rezonabil. Drepturile obligatorii ale consumatorilor nu sunt limitate.",
    ],
  },
  {
    title: "Legea aplicabilă și contact",
    body: [
      "Acești termeni sunt guvernați de legea română, fără a afecta protecțiile obligatorii de care beneficiază consumatorul în țara sa de reședință.",
      "Pentru întrebări despre serviciu sau acești termeni, scrie la andreivilcuro@gmail.com.",
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
