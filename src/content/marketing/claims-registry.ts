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
    statement: "Tot evenimentul, într-un singur fir.",
    support:
      "Setul de module conectate: /plan, /invitations, /rsvp, /guests, /seating, /menus, /transport, /accommodation, /marketplace, /requests, /offers, /contracts, /budget, /event-day",
    status: "implemented",
    limitation:
      "Afirmație de poziționare despre continuitatea dintre module; nu promite automatizare totală.",
  },
  {
    id: "hero-lead",
    statement:
      "Plan, oameni, furnizori, buget și ziua evenimentului — conectate într-un singur spațiu.",
    support:
      "/invitations/editor, /rsvp, /guests, /marketplace + /offers, /budget, /event-day",
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
      "Aceeași informație este folosită în modulele conectate, astfel încât fiecare decizie să aibă context.",
    support:
      "Înregistrarea invitat servește /rsvp, /seating, /menus, /transport, /accommodation (același workspace API)",
    status: "implemented",
    limitation:
      "Nu se folosește formularea «totul se actualizează instant»; alocările (masă, rută, cameră) sunt acțiuni explicite ale echipei.",
  },
  {
    id: "flow-rsvp-propagation",
    statement:
      "RSVP primit: starea invitatului se actualizează, meniul primește preferința, planul meselor cere alocarea, transportul primește cererea.",
    support: "/rsvp (formular publicat), /menus, /seating, /transport",
    status: "implemented",
    limitation:
      "Preferințele și cererile sunt disponibile modulelor; alocarea la masă/rută rămâne o decizie manuală.",
  },
  {
    id: "plan-views",
    statement:
      "Planul poate fi lucrat în vizualizări Listă, Panou, Cronologie și Calendar.",
    support: "/plan (SegmentedControl cu cele patru vizualizări)",
    status: "implemented",
  },
  {
    id: "plan-responsibility",
    statement:
      "Fiecare acțiune are responsabil, termen și dependențe vizibile.",
    support: "/plan (coloanele Responsabil și Termen, dependențe în TaskDrawer)",
    status: "implemented",
  },
  {
    id: "plan-review",
    statement:
      "Schimbările importante sunt revizuite înainte să intre în plan.",
    support:
      "/plan + components/plan/proposal-review.tsx (revizuire, include/exclude, applyPlanProposal)",
    status: "implemented",
    limitation:
      "Unele generări de plan folosesc generatorul determinist de rezervă; produsul o spune explicit. Nu se promite comportament AI universal.",
  },
  {
    id: "plan-b",
    statement: "Riscurile și Planul B rămân lângă decizie.",
    support: "/risks + /contingency-plans (trigger și acțiuni)",
    status: "implemented",
    limitation: "Planul B se administrează în modulul său dedicat.",
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
      "Cererea, oferta, compararea, rezervarea, contractul și bugetul păstrează aceeași urmă operațională.",
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
      "Când începe evenimentul, echipa vede ce se întâmplă, ce urmează și ce trebuie pregătit: Acum/Urmează, desfășurător, checklisturi, check-in și incidente.",
    support: "/event-day (command center cu stări, check-in, incidente)",
    status: "partial",
    limitation:
      "Responsabilitatea este planificată în /plan și roluri de echipă; desfășurătorul nu afișează un responsabil per moment. Nu se revendică compunere de anunțuri, decizii structurate sau integrări live externe.",
  },
  {
    id: "trust-workspace",
    statement:
      "Datele fiecărui eveniment rămân în workspace-ul său și în rolurile autorizate.",
    support: "Izolare pe workspace + permisiuni pe roluri verificate pe server",
    status: "implemented",
  },
  {
    id: "trust-explicit-actions",
    statement:
      "Publicările, aprobările și tranzițiile importante cer o intenție explicită.",
    support:
      "ConfirmDialog pentru publicare invitație/plan/seating/transport, accept ofertă, tranziții wedding-day",
    status: "implemented",
  },
  {
    id: "trust-external",
    statement:
      "Paddle procesează abonamentul Sarbato, iar plățile dintre organizatori și furnizorii evenimentului rămân directe și separate.",
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
