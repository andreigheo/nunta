/** Conținutul public normativ pentru landing-ul Sarbato. */

export type Cta = {
  label: string;
  href: string;
  note?: string;
};

export const routes = {
  signIn: "/sign-in",
  createAccount: "/create-account",
  privacy: "/confidentialitate",
  terms: "/termeni",
} as const;

export const primaryCta: Cta = {
  label: "Creează primul eveniment",
  href: routes.createAccount,
};

export const secondaryCta: Cta = {
  label: "Vezi cum funcționează",
  href: "#flux",
};

export const signInCta: Cta = {
  label: "Intră în cont",
  href: routes.signIn,
};

export const headerNav = [
  { label: "Cum funcționează", href: "#flux" },
  { label: "Invitații", href: "#invitatii" },
  { label: "Organizare", href: "#planificare" },
  { label: "Ziua evenimentului", href: "#ziua-evenimentului" },
  { label: "Abonamente", href: "#abonamente" },
] as const;

export const hero = {
  title: "Fiecare eveniment are sute de detalii. Sarbato le ține împreună.",
  lead: "Creezi invitația, strângi confirmările, organizezi invitații, compari furnizorii, urmărești bugetul și coordonezi ziua evenimentului din același loc.",
  availability: "Disponibil acum pentru organizarea nunților",
  support:
    "Aceeași informație este folosită în modulele conectate, astfel încât fiecare decizie să aibă context.",
} as const;

export const showcaseStages = [
  {
    id: "plan",
    shortLabel: "Plan",
    navLabel: "Planificare",
    action: "Revizuiește următoarea etapă",
    detail:
      "Sarcinile, responsabilitățile și dependențele sunt pregătite pentru aprobare.",
    owner: "Organizator",
    deadline: "Termen: această săptămână",
    connected: ["Calendar", "Responsabili", "Plan B"],
    status: "Propunere pregătită",
    next: "Aprobă etapa",
  },
  {
    id: "rsvp",
    shortLabel: "RSVP",
    navLabel: "Invitați",
    action: "Verifică răspunsul primit",
    detail:
      "Preferințele declarate pot fi folosite pentru meniu, mese și logistică.",
    owner: "Organizator",
    deadline: "Termen: zilele acestea",
    connected: ["Meniuri", "Plan de mese", "Transport"],
    status: "Răspuns înregistrat",
    next: "Alocă la masă",
  },
  {
    id: "vendors",
    shortLabel: "Oferte",
    navLabel: "Furnizori",
    action: "Compară oferta revizuită",
    detail:
      "Versiunea ofertei păstrează contextul cererii, al rezervării și al bugetului.",
    owner: "Organizator",
    deadline: "Valabilitate: limitată",
    connected: ["Rezervare", "Contract", "Buget"],
    status: "Ofertă în revizuire",
    next: "Păstrează decizia",
  },
  {
    id: "event-day",
    shortLabel: "Acum",
    navLabel: "Ziua evenimentului",
    action: "Confirmă următorul moment",
    detail: "Echipa vede ce se întâmplă acum, ce urmează și cine răspunde.",
    owner: "Coordonator",
    deadline: "Stare: în desfășurare",
    connected: ["Desfășurător", "Echipă", "Incidente"],
    status: "Plan B confirmat",
    next: "Continuă desfășurătorul",
  },
] as const;

export const flow = {
  title: "O singură schimbare. Mai puține întrebări.",
  lead: "Urmărește cum o informație intră o dată și devine utilă în următoarele locuri din produs.",
  steps: [
    {
      id: "plan",
      label: "Planifici",
      title: "Decizia intră în plan",
      description:
        "Responsabilul, termenul și dependențele rămân în aceeași etapă revizuită.",
      trigger: "Etapă aprobată",
      results: [
        "Calendarul primește termenul",
        "Responsabilul vede acțiunea",
        "Planul B rămâne atașat",
      ],
      next: "Invitația folosește contextul publicat",
    },
    {
      id: "rsvp",
      label: "Primești răspunsuri",
      title: "Răspunsul devine logistică",
      description:
        "Confirmarea și preferințele pot fi folosite fără liste paralele.",
      trigger: "RSVP primit",
      results: [
        "Starea invitatului se actualizează",
        "Meniul primește preferința",
        "Planul meselor cere alocarea",
        "Transportul primește cererea",
      ],
      next: "Următoarea acțiune: alocarea la masă",
    },
    {
      id: "vendors",
      label: "Alegi furnizorii",
      title: "Oferta păstrează contextul",
      description:
        "Cererea, versiunea ofertei, rezervarea și impactul bugetar rămân legate.",
      trigger: "Ofertă revizuită",
      results: [
        "Rezervarea păstrează decizia",
        "Contractul rămâne asociat",
        "Bugetul urmărește angajamentul",
      ],
      next: "Planul știe ce urmează",
    },
    {
      id: "event-day",
      label: "Coordonezi ziua",
      title: "Planul devine comandă",
      description:
        "Desfășurătorul, echipa, check-in-ul și incidentele folosesc același context operațional.",
      trigger: "Moment confirmat",
      results: [
        "Acum și Urmează sunt clare",
        "Responsabilul este vizibil",
        "Incidentul păstrează decizia",
      ],
      next: "Echipa continuă fără reconstrucții",
    },
  ],
} as const;

export type ProductStory = {
  id: string;
  navLabel: string;
  title: string;
  lead: string;
  capabilities: readonly string[];
  surface: "planning" | "guests" | "vendors" | "event-day";
  tone: "plain" | "coral" | "sun" | "plum";
};

export const productStories: readonly ProductStory[] = [
  {
    id: "planificare",
    navLabel: "Planificare",
    title: "Începi cu un plan pe care îl poți controla.",
    lead: "Sarbato transformă pregătirea într-o succesiune clară de sarcini, termene, responsabilități și decizii. Schimbările importante sunt revizuite înainte să intre în plan.",
    capabilities: [
      "Vezi ce urmează și de ce depinde",
      "Știi cine răspunde de fiecare acțiune",
      "Păstrezi riscurile și Planul B lângă decizie",
    ],
    surface: "planning",
    tone: "plain",
  },
  {
    id: "invitatii",
    navLabel: "Invitații și logistică",
    title: "Prima impresie devine un plan util.",
    lead: "Publici invitația, colectezi răspunsurile și folosești aceleași informații pentru meniuri, mese, transport și cazare.",
    capabilities: [
      "Construiești invitația din secțiuni controlabile",
      "Colectezi RSVP și preferințe fără cont de invitat",
      "Transformi răspunsurile în logistică",
    ],
    surface: "guests",
    tone: "coral",
  },
  {
    id: "furnizori",
    navLabel: "Furnizori și buget",
    title: "Compari înainte să alegi. Vezi impactul înainte să te angajezi.",
    lead: "Cererea, oferta, negocierea, rezervarea, contractul și bugetul păstrează aceeași urmă operațională.",
    capabilities: [
      "Compari versiuni de ofertă în același context",
      "Păstrezi rezervarea și contractul asociate",
      "Urmărești angajamentele fără să intermediezi plata",
    ],
    surface: "vendors",
    tone: "sun",
  },
  {
    id: "ziua-evenimentului",
    navLabel: "Ziua evenimentului",
    title: "Când începe evenimentul, planul devine comandă.",
    lead: "Echipa vede ce se întâmplă, ce urmează și cine trebuie să acționeze, fără să reconstruiască planul din mesaje.",
    capabilities: [
      "Acum și Urmează într-o vedere comună",
      "Checklisturi și check-in pentru echipă",
      "Incidente cu stări clare și Plan B pregătit",
    ],
    surface: "event-day",
    tone: "plum",
  },
] as const;

export const pricing = {
  title: "Începi gratuit. Alegi mai mult când ai nevoie.",
  lead: "Abonamentele plătite vor fi activate după finalizarea integrării Paddle. Până atunci, creezi contul și pornești gratuit.",
  plans: [
    {
      name: "Gratuit",
      price: "0 €",
      cadence: "fără card",
      description: "Pentru primul pas și organizarea de bază a evenimentului.",
      status: "Disponibil",
      cta: primaryCta,
      featured: false,
    },
    {
      name: "Esențial",
      price: "7 €",
      cadence: "pe lună",
      description: "Pentru organizarea completă și colaborarea în echipă.",
      status: "Disponibil în curând",
      featured: true,
    },
    {
      name: "Pro",
      price: "17 €",
      cadence: "pe lună",
      description: "Pentru coordonare operațională avansată.",
      status: "Disponibil în curând",
      featured: false,
    },
  ],
  boundary:
    "Abonamentul Sarbato este separat de plățile dintre organizatori și furnizori.",
} as const;

export const trust = {
  title: "Controlul rămâne la oamenii potriviți.",
  lead: "Produsul arată clar ce este privat, ce necesită confirmare și unde începe responsabilitatea unui furnizor extern.",
  principles: [
    {
      title: "Spațiu privat",
      description:
        "Datele evenimentului rămân în workspace și în rolurile autorizate.",
    },
    {
      title: "Acțiuni explicite",
      description:
        "Publicările, aprobările și tranzițiile importante cer o intenție clară.",
    },
    {
      title: "Extern, marcat clar",
      description:
        "Semnătura electronică și plățile online folosesc furnizori externi identificați explicit în produs.",
    },
    {
      title: "Plăți directe",
      description:
        "Sarbato păstrează evidența; nu încasează și nu transferă plățile dintre organizatori și furnizori.",
    },
  ],
} as const;

export const faqs = [
  {
    q: "Pentru ce tipuri de evenimente este disponibil Sarbato?",
    a: "Produsul este disponibil acum pentru organizarea nunților. Alte tipuri de evenimente vor fi prezentate numai după ce onboardingul și fluxurile lor sunt implementate.",
  },
  {
    q: "Invitații trebuie să își creeze cont?",
    a: "Nu. Invitații folosesc linkul primit pentru confirmare, meniu și informațiile logistice publicate pentru ei.",
  },
  {
    q: "Cum devin răspunsurile un plan?",
    a: "Confirmarea și preferințele colectate pot fi folosite în meniuri, planul meselor, transport și cazare, fără liste separate.",
  },
  {
    q: "Pot lucra împreună cu partenerul sau echipa?",
    a: "Da. Membrii workspace-ului primesc acces potrivit rolului și pot lucra din aceeași versiune a planului.",
  },
  {
    q: "Sarbato procesează plățile către furnizori?",
    a: "Nu. Sarbato nu deține fonduri și nu transferă bani între organizatori și furnizori. Plata se face direct prin metoda stabilită între părți.",
  },
  {
    q: "Ce date ale evenimentului sunt publice?",
    a: "Numai conținutul publicat intenționat, precum invitația. Datele de lucru, răspunsurile și informațiile operaționale rămân în spațiul autorizat.",
  },
  {
    q: "Ce va include fiecare abonament?",
    a: "Gratuit este disponibil acum, pentru pornirea evenimentului. Esențial (7 € pe lună) și Pro (17 € pe lună) sunt marcate «Disponibil în curând» până la finalizarea checkoutului Paddle; beneficiile exacte vor fi publicate la activare.",
  },
  {
    q: "Pot schimba planul după ce am început lucrul?",
    a: "Da. Modificările importante din plan trec prin revizuire înainte să fie aplicate, iar datele de lucru rămân în spațiul evenimentului. Schimbarea abonamentului va fi disponibilă din cont odată cu planurile plătite.",
  },
] as const;

export const finalCta = {
  title: "Începe cu evenimentul tău. Sarbato leagă restul.",
  text: "Creează spațiul evenimentului, adună informația într-un singur loc și păstrează următorul pas clar.",
} as const;

export const footer = {
  tagline:
    "Planificare, invitații, furnizori, buget și coordonare într-un singur fir.",
  stageNote: "Disponibil acum pentru organizarea nunților.",
  columns: [
    {
      title: "Produs",
      links: [
        { label: "Cum funcționează", href: "#flux" },
        { label: "Planificare", href: "#planificare" },
        { label: "Invitații", href: "#invitatii" },
      ],
    },
    {
      title: "Organizare",
      links: [
        { label: "Furnizori", href: "#furnizori" },
        { label: "Ziua evenimentului", href: "#ziua-evenimentului" },
        { label: "Abonamente", href: "#abonamente" },
      ],
    },
    {
      title: "Cont",
      links: [
        { label: primaryCta.label, href: primaryCta.href },
        { label: signInCta.label, href: signInCta.href },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Confidențialitate", href: routes.privacy },
        { label: "Termeni", href: routes.terms },
      ],
    },
  ],
} as const;
