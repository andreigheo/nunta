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
  refunds: "/rambursari",
  cookies: "/cookies",
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
  { label: "Planificare", href: "#planificare" },
  { label: "Invitații", href: "#invitatii" },
  { label: "Furnizori", href: "#furnizori" },
  { label: "Ziua evenimentului", href: "#ziua-evenimentului" },
  { label: "Abonamente", href: "#abonamente" },
] as const;

export const hero = {
  title: "Fiecare eveniment are sute de detalii. Sarbato le ține împreună.",
  highlight: "Sarbato le ține împreună.",
  lead: "Invitația, confirmările, invitații, furnizorii, bugetul și ziua nunții stau în același loc. Nu mai cauți informația prin foi și mesaje.",
  availability: "Disponibil acum pentru organizarea nunților",
  support:
    "Când un invitat confirmă, preferința ajunge la meniu, mese și transport. Tu decizi alocările.",
  tourHint: "Se schimbă singure. Atinge o etapă ca să o oprești.",
  nextStepHint: "Ce urmează acum",
} as const;

export const showcaseStages = [
  {
    id: "plan",
    shortLabel: "Plan",
    navLabel: "Planificare",
    action: "Revizuiește etapa următoare",
    detail: "Sarcinile, cine le face și termenele așteaptă aprobarea ta.",
    owner: "Organizator",
    deadline: "Termen: această săptămână",
    connected: ["Calendar", "Responsabili", "Plan B"],
    status: "Pregătită de aprobat",
    next: "Aprobă etapa",
  },
  {
    id: "rsvp",
    shortLabel: "RSVP",
    navLabel: "Invitați",
    action: "Verifică răspunsul primit",
    detail: "Meniul, mesele și transportul pot folosi ce a ales invitatul.",
    owner: "Organizator",
    deadline: "Termen: zilele acestea",
    connected: ["Meniuri", "Plan de mese", "Transport"],
    status: "Răspuns înregistrat",
    next: "Așază la masă",
  },
  {
    id: "vendors",
    shortLabel: "Oferte",
    navLabel: "Furnizori",
    action: "Compară oferta revizuită",
    detail: "Vezi oferta lângă cerere, rezervare și buget.",
    owner: "Organizator",
    deadline: "Valabilitate: limitată",
    connected: ["Rezervare", "Contract", "Buget"],
    status: "De revizuit",
    next: "Păstrează decizia",
  },
  {
    id: "event-day",
    shortLabel: "Acum",
    navLabel: "Ziua evenimentului",
    action: "Confirmă momentul următor",
    detail: "Echipa vede ce se întâmplă acum, ce urmează și ce trebuie pregătit.",
    owner: "Coordonator",
    deadline: "Stare: în desfășurare",
    connected: ["Desfășurător", "Echipă", "Incidente"],
    status: "Plan B confirmat",
    next: "Continuă desfășurătorul",
  },
] as const;

export const flow = {
  title: "De la primul plan până în ziua nunții.",
  lead: "Fiecare etapă folosește ce ai decis deja. Nu refaci nunta în foi, liste și mesaje.",
  tourHint: "Se schimbă singure. Atinge o etapă ca să o oprești.",
  pickHint: "Alege o etapă ca să vezi de unde pornește și ce lasă mai departe.",
  chapters: [
    {
      id: "planning",
      label: "Planificare",
      stepIds: ["plan"],
    },
    {
      id: "guests",
      label: "Invitați",
      stepIds: ["invitation", "rsvp", "logistics"],
    },
    {
      id: "vendors",
      label: "Furnizori",
      stepIds: ["vendors", "budget"],
    },
    {
      id: "event-day",
      label: "Ziua evenimentului",
      stepIds: ["event-day"],
    },
  ],
  steps: [
    {
      id: "plan",
      label: "Plan",
      title: "Pui pe listă ce trebuie decis",
      description:
        "Sarcinile, cine le face, termenul și ce depinde de ce stau în același plan.",
      trigger: "Prioritățile tale",
      outcomes: [
        { module: "Calendar", state: "Termene puse" },
        { module: "Echipă", state: "Responsabili vizibili" },
        { module: "Plan B", state: "Lângă risc" },
      ],
      next: "Poți publica invitația cu datele din plan",
    },
    {
      id: "invitation",
      label: "Invitație",
      title: "Invitația arată cum vrei tu",
      description:
        "Așezi blocurile, imaginea și culorile, apoi publici. Invitații văd doar ce ai ales să arăți.",
      trigger: "Invitație publicată",
      outcomes: [
        { module: "Program", state: "Publicat" },
        { module: "Detalii", state: "Un singur loc" },
        { module: "RSVP", state: "Formular gata" },
      ],
      next: "Invitatul răspunde din link, fără cont",
    },
    {
      id: "rsvp",
      label: "RSVP",
      title: "Confirmarea nu rămâne într-un mesaj",
      description:
        "Invitatul confirmă din link. Răspunsul și preferințele intră direct în eveniment.",
      trigger: "RSVP primit",
      outcomes: [
        { module: "Invitat", state: "Stare actualizată" },
        { module: "Meniu", state: "Preferință primită" },
        { module: "Mese", state: "Cer alocare" },
        { module: "Transport", state: "Cerere primită" },
      ],
      next: "Urmează să așezi oamenii la mese",
    },
    {
      id: "logistics",
      label: "Logistică",
      title: "Meniuri, mese, mașini și camere, din aceleași răspunsuri",
      description:
        "Preferințele vin din RSVP. Alocarea la masă, pe rută sau în cameră o faci tu.",
      trigger: "Preferințe colectate",
      outcomes: [
        { module: "Meniuri", state: "De centralizat" },
        { module: "Mese", state: "Ce mai trebuie așezat" },
        { module: "Transport și cazare", state: "Cererile rămân" },
      ],
      next: "Vezi excepțiile înainte să confirmi furnizorii",
    },
    {
      id: "vendors",
      label: "Furnizori",
      title: "Compari ofertele înainte să alegi",
      description:
        "Cererea, oferta, rezervarea și contractul stau împreună. Nu cauți versiunea bună în e-mail.",
      trigger: "Ofertă revizuită",
      outcomes: [
        { module: "Rezervare", state: "Decizia e aici" },
        { module: "Contract", state: "Asociat" },
        { module: "Buget", state: "Urmărește angajamentul" },
      ],
      next: "Oferta acceptată se vede în buget",
    },
    {
      id: "budget",
      label: "Buget",
      title: "Bugetul urmărește ce ai rezervat",
      description:
        "Vezi angajamentele lângă rezervări și documente. Sarbato nu încasează și nu transferă banii către furnizor.",
      trigger: "Rezervare confirmată",
      outcomes: [
        { module: "Categorie", state: "Angajament" },
        { module: "Document", state: "Asociat" },
        { module: "Plată", state: "Notată, făcută direct" },
      ],
      next: "Planul zilei folosește furnizorii confirmați",
    },
    {
      id: "event-day",
      label: "Ziua evenimentului",
      title: "În ziua nunții, toată echipa vede același plan",
      description:
        "Desfășurătorul, check-in-ul, checklisturile și incidentele folosesc același plan. Echipa nu reconstruiește ziua din mesaje.",
      trigger: "Moment confirmat",
      outcomes: [
        { module: "Acum", state: "Clar" },
        { module: "Urmează", state: "De pregătit" },
        { module: "Incident", state: "Decizia e aici" },
      ],
      next: "Echipa continuă fără să refacă planul",
    },
  ],
} as const;

export type ProductStory = {
  id: string;
  navLabel: string;
  title: string;
  lead: string;
  capabilities: readonly string[];
  stages: readonly string[];
  handoff: {
    input: string;
    output: string;
  };
  surface: "planning" | "guests" | "vendors" | "event-day";
  tone: "plain" | "coral" | "sun" | "plum";
};

export const productStories: readonly ProductStory[] = [
  {
    id: "planificare",
    navLabel: "Planificare",
    title: "Un plan pe care îl poți controla.",
    lead: "Sarcinile, termenele și cine le face stau într-un singur plan. Schimbările importante le revizuiești înainte să intre în lucru.",
    capabilities: [
      "Vezi ce urmează și de ce depinde",
      "Știi cine răspunde de fiecare acțiune",
      "Păstrezi riscurile și Planul B lângă decizie",
    ],
    stages: ["Plan", "Calendar", "Responsabili"],
    handoff: {
      input: "Priorități, termene și dependențe",
      output: "O etapă aprobată, gata de folosit",
    },
    surface: "planning",
    tone: "plain",
  },
  {
    id: "invitatii",
    navLabel: "Invitații și logistică",
    title: "Invitația arată ca evenimentul tău. Răspunsurile lucrează pentru plan.",
    lead: "Construiești invitația din blocuri, o publici, strângi RSVP-urile. Aceleași răspunsuri alimentează meniurile, mesele, transportul și cazarea.",
    capabilities: [
      "Reordonezi blocurile și controlezi fiecare secțiune",
      "Ajustezi imaginea, paleta, layoutul și previzualizarea",
      "Colectezi RSVP și preferințe, fără cont de invitat",
    ],
    stages: ["Invitație", "RSVP", "Logistică"],
    handoff: {
      input: "Conținutul pe care l-ai publicat",
      output: "Răspunsuri gata de alocat",
    },
    surface: "guests",
    tone: "coral",
  },
  {
    id: "furnizori",
    navLabel: "Furnizori și buget",
    title: "Compari înainte să alegi. Vezi impactul înainte să te angajezi.",
    lead: "Cererea, oferta, rezervarea, contractul și bugetul stau împreună. Plata către furnizor o faci tu, direct.",
    capabilities: [
      "Compari versiuni de ofertă în același loc",
      "Păstrezi rezervarea și contractul asociate",
      "Urmărești angajamentele, fără să intermediezi plata",
    ],
    stages: ["Cerere", "Ofertă", "Buget"],
    handoff: {
      input: "Cerințe și limite de buget",
      output: "Decizia, lângă rezervare și contract",
    },
    surface: "vendors",
    tone: "sun",
  },
  {
    id: "ziua-evenimentului",
    navLabel: "Ziua evenimentului",
    title: "Când începe nunta, planul e în fața echipei.",
    lead: "Toată lumea vede ce se întâmplă, ce urmează și ce trebuie pregătit. Nu mai reconstruiești ziua din mesaje.",
    capabilities: [
      "Acum și Urmează, într-o vedere comună",
      "Checklisturi și check-in pentru echipă",
      "Incidente cu stări clare și Plan B pregătit",
    ],
    stages: ["Desfășurător", "Check-in", "Plan B"],
    handoff: {
      input: "Planul aprobat și starea zilei",
      output: "Acum, Urmează și următoarea pregătire",
    },
    surface: "event-day",
    tone: "plum",
  },
] as const;

export const pricing = {
  title: "Începi gratuit. Plătești când îți trebuie mai mult.",
  lead: "Gratuit ține planul, invitația și RSVP-ul. Plus adaugă logistica invitaților și furnizorii. Pro deschide ziua evenimentului.",
  plans: [
    {
      name: "Gratuit",
      price: "0 €",
      cadence: "fără card",
      description: "Pentru primul pas: plan, invitație și confirmări.",
      features: [
        "Plan, calendar, buget, invitație, RSVP și e-mail",
        "Până la 50 de invitați și 2 colaboratori",
        "5 acțiuni AI pe lună și 250 MB stocare",
      ],
      status: "Disponibil",
      cta: { label: "Începe gratuit", href: routes.createAccount },
      featured: false,
    },
    {
      name: "Plus",
      price: "7 €",
      cadence: "pe lună",
      description: "Pentru mese, transport, cazare, furnizori și documente.",
      features: [
        "Până la 200 de invitați și 5 colaboratori",
        "Mese, transport, cazare, furnizori și documente",
        "5 automatizări, 30 acțiuni AI pe lună și 2 GB",
      ],
      status: "Alegi din cont",
      cta: { label: "Începe cu Plus", href: routes.createAccount },
      featured: true,
    },
    {
      name: "Pro",
      price: "17 €",
      cadence: "pe lună",
      description: "Pentru riscuri, Plan B, check-in și ziua evenimentului.",
      features: [
        "Până la 500 de invitați și 15 colaboratori",
        "Riscuri, Plan B, check-in și ziua evenimentului",
        "25 automatizări, 150 acțiuni AI pe lună și 10 GB",
      ],
      status: "Alegi din cont",
      cta: { label: "Începe cu Pro", href: routes.createAccount },
      featured: false,
    },
  ],
  boundary:
    "Paddle procesează abonamentul Sarbato. Banii către furnizori îi plătești tu, direct.",
  checkoutNote:
    "Creezi evenimentul, apoi alegi sau schimbi planul din setările contului.",
} as const;

export const trust = {
  title: "Cine vede ce, și cine plătește ce.",
  lead: "Echipa lucrează intern. Invitații văd doar ce publici. Abonamentul Sarbato e separat de plățile către furnizori.",
  principles: [
    {
      audience: "Echipă",
      title: "Spațiul echipei",
      description:
        "Planul, răspunsurile, bugetul și ziua evenimentului rămân în echipă, după rol.",
    },
    {
      audience: "Invitat",
      title: "Ce vede invitatul",
      description:
        "Invitații văd doar ce ai publicat pentru ei. Răspund din link, fără acces la spațiul intern.",
    },
    {
      audience: "Decizie",
      title: "Nimic important nu se publică singur",
      description:
        "Publicările, aprobările și schimbările de stare cer o confirmare explicită.",
    },
    {
      audience: "Plată",
      title: "Limita plăților",
      description:
        "Paddle procesează abonamentul Sarbato. Furnizorii evenimentului sunt plătiți direct, prin metoda agreată între voi.",
    },
  ],
} as const;

export const faqs = [
  {
    q: "Pentru ce tipuri de evenimente este disponibil Sarbato?",
    a: "Acum, pentru nunți. Alte tipuri de evenimente le vom arăta când onboardingul și fluxurile lor sunt gata.",
  },
  {
    q: "Invitații trebuie să își creeze cont?",
    a: "Nu. Folosesc linkul primit pentru confirmare, meniu și detaliile publicate pentru ei.",
  },
  {
    q: "Cât de mult pot personaliza invitația?",
    a: "Reordonezi blocurile, le arăți sau le ascunzi, schimbi imaginea, paleta și layoutul, verifici desktop, tabletă și mobil, apoi publici formularul RSVP.",
  },
  {
    q: "Pot lucra împreună cu partenerul sau echipa?",
    a: "Da. Membrii echipei primesc acces după rol și lucrează din aceeași versiune a planului.",
  },
  {
    q: "Sarbato procesează plățile către furnizori?",
    a: "Nu. Sarbato nu deține fonduri și nu transferă bani între organizatori și furnizori. Plata se face direct, prin metoda agreată între voi.",
  },
  {
    q: "Ce date ale evenimentului sunt publice?",
    a: "Doar ce publici intenționat, de exemplu invitația. Planul de lucru, răspunsurile și detaliile zilei rămân în echipă.",
  },
  {
    q: "Ce include fiecare abonament?",
    a: "Gratuit: plan, invitație și RSVP, până la 50 de invitați. Plus (7 €/lună): mese, transport, cazare, furnizori și documente, până la 200 de invitați. Pro (17 €/lună): riscuri, Plan B, check-in și ziua evenimentului, până la 500 de invitați.",
  },
  {
    q: "Pot schimba planul după ce am început lucrul?",
    a: "Da, din setările evenimentului. Dacă treci la un plan mai mic, datele rămân vizibile, iar acțiunile care depășesc noul plan se blochează până la upgrade.",
  },
] as const;

export const finalCta = {
  title: "Creează evenimentul. Restul îl ții aici.",
  text: "Fără card. Invitații răspund din link. Planul îl schimbi din cont, când ai nevoie.",
  assurances: [
    "Plan gratuit, fără card",
    "Invitații răspund fără cont",
    "Planul se schimbă din cont",
  ],
} as const;

export const footer = {
  tagline: "Plan, invitații, furnizori, buget și ziua nunții, în același loc.",
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
        { label: "Rambursări", href: routes.refunds },
        { label: "Cookie-uri", href: routes.cookies },
      ],
    },
  ],
} as const;
