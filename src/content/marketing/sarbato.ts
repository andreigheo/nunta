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
  lead: "Creezi invitația, strângi confirmările, organizezi invitații, compari furnizorii, urmărești bugetul și coordonezi ziua evenimentului din același loc.",
  availability: "Disponibil acum pentru organizarea nunților",
  support:
    "Aceeași informație este folosită în modulele conectate, astfel încât fiecare decizie să aibă context.",
  tourHint: "Etapele se derulează singure. Atinge una ca să o păstrezi.",
  nextStepHint: "Următorul pas, în context",
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
    detail: "Echipa vede ce se întâmplă acum, ce urmează și ce trebuie pregătit.",
    owner: "Coordonator",
    deadline: "Stare: în desfășurare",
    connected: ["Desfășurător", "Echipă", "Incidente"],
    status: "Plan B confirmat",
    next: "Continuă desfășurătorul",
  },
] as const;

export const flow = {
  title: "Șapte etape. Un singur fir al deciziilor.",
  lead: "De la primul plan până la ultimul check-in, fiecare etapă preia contextul celei dinainte. Nu reconstruiești evenimentul în foi, liste și mesaje separate.",
  tourHint: "Etapele se derulează singure. Atinge una ca să o păstrezi.",
  pickHint: "Alege o etapă pentru a vedea ce preia și ce predă mai departe.",
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
      title: "Începi cu deciziile care dau direcție",
      description:
        "Prioritățile, responsabilul, termenul și dependențele rămân în aceeași etapă revizuită.",
      trigger: "Priorități definite",
      results: [
        "Calendarul primește termenele",
        "Echipa vede responsabilitățile",
        "Riscurile rămân lângă Planul B",
      ],
      next: "Planul aprobat pregătește informația care poate fi publicată",
    },
    {
      id: "invitation",
      label: "Invitație",
      title: "Transformi detaliile într-o experiență publică",
      description:
        "Alegi blocurile, imaginea, paleta și layoutul, apoi publici numai informația pregătită pentru invitați.",
      trigger: "Invitație publicată",
      results: [
        "Programul este ușor de găsit",
        "Detaliile logistice au un singur loc",
        "Formularul RSVP este pregătit",
      ],
      next: "Invitatul poate răspunde fără să își creeze cont",
    },
    {
      id: "rsvp",
      label: "RSVP",
      title: "Răspunsul devine logistică",
      description:
        "Confirmarea și preferințele intră în spațiul evenimentului fără liste paralele.",
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
      id: "logistics",
      label: "Logistică",
      title: "Cererea este vizibilă acolo unde se rezolvă",
      description:
        "Meniul, mesele, transportul și cazarea pornesc din răspunsurile primite, iar alocările rămân decizii explicite ale echipei.",
      trigger: "Preferințe colectate",
      results: [
        "Meniurile pot fi centralizate",
        "Mesele arată ce mai trebuie alocat",
        "Transportul și cazarea păstrează cererile",
      ],
      next: "Echipa vede excepțiile înainte să confirme furnizorii",
    },
    {
      id: "vendors",
      label: "Furnizori",
      title: "Oferta păstrează contextul",
      description:
        "Cererea, versiunea ofertei, rezervarea și impactul bugetar rămân legate.",
      trigger: "Ofertă revizuită",
      results: [
        "Rezervarea păstrează decizia",
        "Contractul rămâne asociat",
        "Bugetul urmărește angajamentul",
      ],
      next: "Oferta acceptată pregătește angajamentul de buget",
    },
    {
      id: "budget",
      label: "Buget",
      title: "Angajamentul rămâne lângă decizia care l-a creat",
      description:
        "Bugetul urmărește rezervările și documentele, fără ca Sarbato să încaseze sau să transfere plata către furnizor.",
      trigger: "Rezervare confirmată",
      results: [
        "Categoria păstrează angajamentul",
        "Documentul rămâne asociat",
        "Plata directă poate fi urmărită operațional",
      ],
      next: "Planul zilei folosește furnizorii și termenele confirmate",
    },
    {
      id: "event-day",
      label: "Ziua evenimentului",
      title: "Planul devine vedere operațională",
      description:
        "Desfășurătorul, check-in-ul, checklisturile și incidentele folosesc același context operațional.",
      trigger: "Moment confirmat",
      results: [
        "Acum și Urmează sunt clare",
        "Echipa vede ce trebuie pregătit",
        "Incidentul păstrează decizia",
      ],
      next: "Echipa continuă fără să reconstruiască planul",
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
    title: "Începi cu un plan pe care îl poți controla.",
    lead: "Sarbato transformă pregătirea într-o succesiune clară de sarcini, termene, responsabilități și decizii. Schimbările importante sunt revizuite înainte să intre în plan.",
    capabilities: [
      "Vezi ce urmează și de ce depinde",
      "Știi cine răspunde de fiecare acțiune",
      "Păstrezi riscurile și Planul B lângă decizie",
    ],
    stages: ["Plan", "Calendar", "Responsabili"],
    handoff: {
      input: "Priorități, termene și dependențe",
      output: "O etapă aprobată, gata să fie folosită mai departe",
    },
    surface: "planning",
    tone: "plain",
  },
  {
    id: "invitatii",
    navLabel: "Invitații și logistică",
    title: "Invitația arată ca evenimentul tău și lucrează pentru plan.",
    lead: "Alegi blocurile, imaginea, paleta și layoutul, apoi publici invitația, colectezi răspunsurile și folosești aceleași informații pentru meniuri, mese, transport și cazare.",
    capabilities: [
      "Construiești din blocuri reordonabile și controlezi fiecare secțiune",
      "Ajustezi imaginea hero, paleta, layoutul și previzualizarea",
      "Colectezi RSVP și preferințe fără cont de invitat",
    ],
    stages: ["Invitație", "RSVP", "Logistică"],
    handoff: {
      input: "Conținut publicat intenționat",
      output: "Răspunsuri și cereri pregătite pentru alocare",
    },
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
    stages: ["Cerere", "Ofertă", "Buget"],
    handoff: {
      input: "Cerințe și limite de buget",
      output: "Decizia păstrată lângă rezervare și contract",
    },
    surface: "vendors",
    tone: "sun",
  },
  {
    id: "ziua-evenimentului",
    navLabel: "Ziua evenimentului",
    title: "Când începe evenimentul, planul devine vedere operațională.",
    lead: "Echipa vede ce se întâmplă, ce urmează și ce trebuie pregătit, fără să reconstruiască planul din mesaje.",
    capabilities: [
      "Acum și Urmează într-o vedere comună",
      "Checklisturi și check-in pentru echipă",
      "Incidente cu stări clare și Plan B pregătit",
    ],
    stages: ["Desfășurător", "Check-in", "Plan B"],
    handoff: {
      input: "Planul aprobat și starea operațională",
      output: "Acum, Urmează și pregătirea următoarei tranziții",
    },
    surface: "event-day",
    tone: "plum",
  },
] as const;

export const pricing = {
  title: "Începi gratuit. Alegi mai mult când ai nevoie.",
  lead: "Fiecare plan păstrează planificarea de bază într-un singur loc. Plus adaugă logistica și colaborarea, iar Pro deschide controlul operațional complet.",
  plans: [
    {
      name: "Gratuit",
      price: "0 €",
      cadence: "fără card",
      description: "Pentru primul pas și organizarea de bază a evenimentului.",
      features: [
        "Plan, calendar, buget, invitație și RSVP",
        "Până la 50 de invitați și 2 colaboratori",
        "5 acțiuni AI și 250 MB de stocare",
      ],
      status: "Disponibil",
      cta: { label: "Începe gratuit", href: routes.createAccount },
      featured: false,
    },
    {
      name: "Plus",
      price: "7 €",
      cadence: "pe lună",
      description:
        "Pentru organizarea completă, logistica invitaților și coordonarea furnizorilor.",
      features: [
        "Până la 200 de invitați și 5 colaboratori",
        "Mese, transport, cazare și documente",
        "5 automatizări, 30 acțiuni AI și 2 GB",
      ],
      status: "Disponibil în cont",
      cta: { label: "Începe cu Plus", href: routes.createAccount },
      featured: true,
    },
    {
      name: "Pro",
      price: "17 €",
      cadence: "pe lună",
      description: "Pentru coordonare operațională avansată.",
      features: [
        "Până la 500 de invitați și 15 colaboratori",
        "Riscuri, Plan B, check-in și ziua evenimentului",
        "25 automatizări, 150 acțiuni AI și 10 GB",
      ],
      status: "Disponibil în cont",
      cta: { label: "Începe cu Pro", href: routes.createAccount },
      featured: false,
    },
  ],
  boundary:
    "Paddle procesează abonamentul Sarbato. Plățile dintre organizatori și furnizori rămân directe și separate.",
  checkoutNote:
    "Creezi evenimentul, apoi alegi sau schimbi planul din setările contului.",
} as const;

export const trust = {
  title: "Fiecare informație are o limită clară.",
  lead: "Planul de lucru rămâne în echipă, invitații văd numai ce publici, iar serviciile externe sunt delimitate de organizarea evenimentului.",
  principles: [
    {
      audience: "Echipă",
      title: "Spațiul echipei",
      description:
        "Planul, răspunsurile, bugetul și operațiunile rămân în workspace și în rolurile autorizate.",
    },
    {
      audience: "Invitat",
      title: "Vederea invitatului",
      description:
        "Invitații văd numai conținutul publicat pentru ei și pot răspunde fără acces la spațiul intern.",
    },
    {
      audience: "Decizie",
      title: "Decizii explicite",
      description:
        "Publicările, aprobările și tranzițiile importante cer o intenție clară înainte să schimbe starea.",
    },
    {
      audience: "Plată",
      title: "Limita plăților",
      description:
        "Paddle procesează abonamentul Sarbato; furnizorii evenimentului sunt plătiți direct prin metoda stabilită între părți.",
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
    q: "Cât de mult pot personaliza invitația?",
    a: "Poți combina și reordona blocuri, controla vizibilitatea lor, ajusta imaginea hero, paleta și layoutul, verifica versiunea desktop, tabletă și mobil, apoi publica formularul RSVP.",
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
    a: "Gratuit include planificarea de bază, invitația și RSVP pentru maximum 50 de invitați. Plus (7 € pe lună) adaugă logistica, furnizorii, documentele și automatizările pentru maximum 200 de invitați. Pro (17 € pe lună) adaugă riscurile, Plan B, check-inul și operațiunile din ziua evenimentului pentru maximum 500 de invitați.",
  },
  {
    q: "Pot schimba planul după ce am început lucrul?",
    a: "Da. Schimbarea abonamentului se face din setările evenimentului. La trecerea la un plan inferior, datele existente rămân disponibile pentru citire, iar acțiunile care depășesc noul plan sunt blocate până la reactivare sau upgrade.",
  },
] as const;

export const finalCta = {
  title: "Începe cu evenimentul tău. Sarbato leagă restul.",
  text: "Creează spațiul evenimentului, adună informația într-un singur loc și păstrează următorul pas clar.",
  assurances: [
    "Plan gratuit, fără card",
    "Invitații răspund fără cont",
    "Planul se schimbă din cont",
  ],
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
        { label: "Rambursări", href: routes.refunds },
        { label: "Cookie-uri", href: routes.cookies },
      ],
    },
  ],
} as const;
