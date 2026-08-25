/**
 * Registrul intern al afirmațiilor publice Sarbato.
 *
 * Fiecare afirmație afișată pe landing este legată de o rută, o operație
 * sau un contract implementat. Statutul guvernează formularea publică:
 * - `implemented`: poate fi afirmată direct;
 * - `partial`: necesită limitarea de formulare notată;
 * - `planned`: nu poate apărea ca disponibilitate, doar ca stare onestă.
 *
 * Acest fișier este sursa de adevăr internă pentru revizuirile de copy;
 * nu este randat pe pagină.
 */

export type ClaimStatus = "implemented" | "partial" | "planned";

export type MarketingClaim = {
  id: string;
  statement: string;
  support: string;
  status: ClaimStatus;
  limitation?: string;
};

export const marketingClaims: readonly MarketingClaim[] = [
  {
    id: "hero-title",
    statement: "Fiecare eveniment are sute de detalii. Sarbato le ține împreună.",
    support:
      "Setul de module conectate: /plan, /invitations, /rsvp, /guests, /seating, /menus, /transport, /accommodation, /marketplace, /requests, /offers, /contracts, /budget, /wedding-day",
    status: "implemented",
    limitation:
      "Afirmație de poziționare; nu se extinde la „toate detaliile” absolute.",
  },
  {
    id: "hero-lead",
    statement:
      "Invitația, confirmările, invitații, furnizorii, bugetul și ziua nunții stau în același loc.",
    support:
      "/invitations/editor, /rsvp, /guests, /marketplace + /offers, /budget, /wedding-day",
    status: "implemented",
  },
  {
    id: "availability",
    statement: "Disponibil acum pentru organizarea nunților.",
    support: "/onboarding (flux orientat pe nuntă) și întregul model de produs",
    status: "implemented",
    limitation:
      "Alte tipuri de evenimente nu sunt prezentate ca disponibile; onboarding-ul este construit pentru nunți.",
  },
  {
    id: "shared-information",
    statement:
      "Când un invitat confirmă, preferința ajunge la meniu, mese și transport. Tu decizi alocările.",
    support:
      "Înregistrarea invitat servește /rsvp, /seating, /menus, /transport, /accommodation (același workspace API)",
    status: "implemented",
    limitation:
      "Nu se folosește formularea «totul se actualizează instant»; alocările (masă, rută, cameră) sunt acțiuni explicite ale echipei.",
  },
  {
    id: "flow-rsvp-propagation",
    statement:
      "RSVP primit: invitatul are starea actualizată, meniul primește preferința, mesele cer alocare, transportul primește cererea.",
    support: "/rsvp (formular publicat), /menus, /seating, /transport",
    status: "implemented",
    limitation:
      "Preferințele și cererile sunt disponibile modulelor; alocarea la masă/rută rămâne o decizie manuală.",
  },
  {
    id: "plan-views",
    statement:
      "Toate sarcinile și După stare sunt vizualizările complete ale planului; Cronologie și Calendar au fiecare pagina lor.",
    support:
      "/plan (SegmentedControl: list, board, timeline, calendar) + /timeline (faze și repere) + /calendar (grilă lunară agregată, export ICS)",
    status: "implemented",
    limitation:
      "Cele patru comutatoare din /plan există, dar «După termen» și «Calendar» randează liste simplificate; adâncimea reală stă în /timeline și /calendar. Landing-ul nu prezintă cele patru vizualizări ca echivalente.",
  },
  {
    id: "plan-responsibility",
    statement:
      "Fiecare sarcină are responsabil, prioritate, stare și termen, iar finalizarea așteaptă sarcinile de care depinde.",
    support:
      "/plan (coloanele Responsabil, Prioritate, Stare, Termen) + planning.service.ts (finalizarea respinsă până când dependențele sunt COMPLETED) + PUT /tasks/:taskId/dependencies",
    status: "implemented",
    limitation:
      "Responsabilul este un membru al workspace-ului (`assigneeMembershipId`), nu un rol generic; fără alocare, starea afișată este «Nealocat». TaskDrawer permite setarea unui predecesor, dar nu listează încă dependențele existente, deci nu se afirmă «dependențe vizibile».",
  },
  {
    id: "plan-proposal",
    statement:
      "Răspunsurile din onboarding devin o propunere de plan cu faze, repere și sarcini, pe care o revizuiești element cu element înainte să devină planul tău.",
    support:
      "POST /plan-generations, PATCH /plan-proposals/:id, POST /plan-proposals/:id/apply (capacitatea planning.apply) + components/plan/proposal-review.tsx (include/exclude, motiv obligatoriu la excluderea unui element required, «Ce am presupus», «De verificat», «Ce include propunerea»)",
    status: "implemented",
    limitation:
      "Revizuirea acoperă structura generată, nu fiecare editare manuală ulterioară: o sarcină creată de mână intră direct în plan. Aplicarea creează faze, repere și dependențe, dar nu atribuie responsabili.",
  },
  {
    id: "plan-review",
    statement:
      "Nimic nu devine plan definitiv până la aplicare; propunerea poate fi regenerată sau respinsă.",
    support:
      "/plan + components/plan/proposal-review.tsx (Regenerează, Respinge, Aplică planul, cu confirmare explicită)",
    status: "implemented",
    limitation:
      "Unele generări de plan folosesc generatorul determinist de rezervă; produsul o spune explicit prin badge-ul de generator. Nu se promite comportament AI universal.",
  },
  {
    id: "plan-b",
    statement: "Riscurile și Planul B se administrează în modulele lor.",
    support: "/risks + /contingency-plans (trigger și acțiuni)",
    status: "implemented",
    limitation:
      "Planul B se leagă opțional de un risc, nu de o sarcină sau o fază din plan; contractele nu au `taskId`/`phaseId`. Afirmația nu mai apare în capitolul #planificare, ca să nu sugereze atașarea la etapa din plan.",
  },
  {
    id: "invitation-editor",
    statement:
      "Invitația se construiește din blocuri reordonabile, cu imagine hero, paletă, layout, controale de vizibilitate, previzualizare responsive, secțiune RSVP, salvare și publicare.",
    support: "/invitations/editor (toate verificate în cod)",
    status: "implemented",
    limitation:
      "Scrierea cu AI este dezactivată (planificată) și nu este prezentată ca funcțională pe landing.",
  },
  {
    id: "guest-no-account",
    statement:
      "Invitații răspund fără cont, prin linkul securizat primit.",
    support: "/guest (Guest Companion) + publicarea invitației și a formularului RSVP",
    status: "implemented",
  },
  {
    id: "vendor-chain",
    statement:
      "Cererea, oferta, rezervarea, contractul și bugetul stau împreună. Plata către furnizor o faci tu, direct.",
    support:
      "/requests, /offers (versiuni imuabile, accept atomic → booking + contract + proiecție de buget), /contracts, /budget",
    status: "implemented",
  },
  {
    id: "no-payment-intermediation",
    statement:
      "Sarbato nu colectează și nu transferă plățile dintre organizatori și furnizori; plățile se fac direct, prin metoda agreată de părți.",
    support:
      "/payments (evidență operațională, metode externe) + absența intenționată a unui procesor de plăți vendor",
    status: "implemented",
  },
  {
    id: "contract-signature",
    statement:
      "Contractele pot fi confirmate operațional sau trimise la semnat prin furnizorul extern configurat.",
    support: "/contracts (acknowledge cu nume tastat; plicuri de semnătură externe)",
    status: "partial",
    limitation:
      "Confirmarea operațională nu este semnătură electronică calificată; sesiunea de semnare aparține furnizorului extern. Nivelul juridic nu este promis public.",
  },
  {
    id: "event-day-command",
    statement:
      "Când începe nunta, echipa vede ce se întâmplă, ce urmează și ce trebuie pregătit: Acum/Urmează, desfășurător, checklisturi, check-in și incidente.",
    support: "/wedding-day (command center cu stări, check-in, incidente)",
    status: "partial",
    limitation:
      "Responsabilitatea este planificată în /plan și roluri de echipă; desfășurătorul nu afișează un responsabil per moment. Nu se revendică compunere de anunțuri, decizii structurate sau integrări live externe.",
  },
  {
    id: "trust-workspace",
    statement:
      "Planul, răspunsurile, bugetul și ziua evenimentului rămân în echipă, după rol.",
    support: "Izolare pe workspace + permisiuni pe roluri verificate pe server",
    status: "implemented",
  },
  {
    id: "trust-explicit-actions",
    statement:
      "Publicările, aprobările și schimbările de stare cer o confirmare explicită.",
    support:
      "ConfirmDialog pentru publicare invitație/plan/seating/transport, accept ofertă, tranziții wedding-day",
    status: "implemented",
  },
  {
    id: "trust-external",
    statement:
      "Paddle procesează abonamentul Sarbato. Banii către furnizori îi plătești tu, direct.",
    support:
      "/settings?tab=billing + catalogul Paddle Live; /payments păstrează numai evidența operațională a plăților externe către furnizori",
    status: "implemented",
  },
  {
    id: "pricing-free",
    statement: "Începi gratuit.",
    support: "/create-account (flux real de cont, fără plată)",
    status: "implemented",
  },
  {
    id: "pricing-paid",
    statement:
      "Plus (7 €/lună) și Pro (17 €/lună), facturate lunar prin Paddle.",
    support:
      "/settings?tab=billing; catalogul Paddle Live și endpoint-urile workspace billing",
    status: "implemented",
  },
  {
    id: "other-event-types",
    statement: "Alte tipuri de evenimente (botez, aniversări etc.)",
    support: "Model de produs orientat pe nuntă în prezent",
    status: "planned",
    limitation:
      "Nu sunt advertise-uite ca disponibile; menționate doar ca direcție onestă în FAQ.",
  },
] as const;

export function claimsByStatus(status: ClaimStatus): readonly MarketingClaim[] {
  return marketingClaims.filter((claim) => claim.status === status);
}
