/** Conținutul public normativ pentru landing-ul Sarbato. */

export type Cta = {
  label: string;
  href: string;
  note?: string;
};

export const routes = {
  signIn: "/sign-in",
  createAccount: "/create-account",
  contact: "/contact",
  privacy: "/confidentialitate",
  terms: "/termeni",
  refunds: "/rambursari",
  cookies: "/cookies",
} as const;

export const primaryCta: Cta = {
  label: "Începe organizarea",
  href: routes.createAccount,
};

export const secondaryCta: Cta = {
  label: "Vezi produsul",
  href: "/produs",
};

export const signInCta: Cta = {
  label: "Autentificare",
  href: routes.signIn,
};

export const headerNav = [
  { label: "Produs", href: "/produs" },
  { label: "Soluții", href: "/#solutii" },
  { label: "Prețuri", href: "/#abonamente" },
  { label: "Întrebări", href: "/#intrebari" },
  { label: "Despre noi", href: "/#despre" },
] as const;

export const productFirstControlRoom = {
  name: "Product-first control room",
  category: "Sistem de operare pentru organizatori",
  title: "Tot evenimentul, într-un singur fir.",
  titleLines: ["Tot evenimentul,", "într-un singur fir."],
  lead: "Plan, oameni, furnizori, buget și ziua evenimentului. Toate conectate într-un singur spațiu.",
  previewLabel: "Previzualizare produs",
  flowTitle: "Firul evenimentului",
  stages: [
    "Plan",
    "Invitații",
    "RSVP",
    "Logistică",
    "Furnizori",
    "Buget",
    "Ziua evenimentului",
  ],
  recommendedAction: {
    label: "Acțiune recomandată",
    title: "Trimite invitațiile către lista principală",
    detail: "Următoarea acțiune rămâne legată de plan și de starea invitaților.",
    action: "Deschide invitațiile",
  },
  metricCards: [
    {
      key: "rsvp",
      proofKey: "rsvp",
      demoValue: "128 / 240",
      label: "RSVP",
      detail: "Răspunsuri primite",
      iconTone: "sage",
      barTone: "sage",
      action: "Vezi detalii",
      href: "/invitations",
    },
    {
      key: "budget",
      proofKey: "budget",
      demoValue: "68%",
      label: "Buget",
      detail: "Cheltuit până acum",
      iconTone: "ink",
      barTone: "sage",
      action: "Vezi bugetul",
      href: "/budget",
    },
    {
      key: "activities",
      proofKey: "activities",
      demoValue: "7",
      label: "Activități",
      detail: "De făcut astăzi",
      iconTone: "coral",
      barTone: "coral",
      action: "Vezi lista",
      href: "/plan",
    },
    {
      key: "suppliers",
      proofKey: "suppliers",
      demoValue: "3",
      label: "Furnizori",
      detail: "Confirmări în așteptare",
      iconTone: "ink",
      barTone: "sage",
      action: "Vezi furnizorii",
      href: "/marketplace",
    },
  ],
  solutionsIntro: {
    title: "De la plan la ziua evenimentului, fără rupturi.",
    lead: "Sarbato aduce planul, invitațiile, furnizorii, bugetul și coordonarea din ziua evenimentului într-un singur sistem. Vezi ce urmează, cine se ocupă și ce are nevoie de atenție, fără să pierzi firul.",
  },
  chapters: {
    planning: {
      id: "planificare",
      title: "Planifici și urmărești totul din start.",
      lead: "Construiește planul, împarte responsabilitățile și urmărește progresul activităților în timp real.",
      link: "Vezi planificarea",
      surfaceTitle: "Planul activităților",
      tabs: ["Listă", "Calendar", "Kanban"],
      rows: [
        ["Stabilește tema și conceptul", "Coordonator", "Termen apropiat", "Finalizată"],
        ["Trimite invitațiile", "Comunicare", "În desfășurare", "În progres"],
        ["Confirmă locația", "Coordonator", "Termen apropiat", "De făcut"],
        ["Finalizează meniul", "Furnizor", "În așteptare", "De făcut"],
        ["Plan logistică și transport", "Logistică", "Termen apropiat", "De făcut"],
      ],
    },
    guests: {
      id: "invitatii",
      title: "Coordonezi invitații și comunicarea.",
      lead: "Gestionezi lista de invitați, trimiți invitații, urmărești răspunsurile și comunici eficient.",
      link: "Vezi invitații",
      surfaceTitle: "Invitați",
      tabs: ["Toți", "Invitați", "Au răspuns", "Nu au răspuns"],
      rows: [
        ["Maria Popescu", "maria.popescu@email.ro", "Echipă", "A răspuns"],
        ["Andrei Ionescu", "andrei.ionescu@email.ro", "Parteneri", "A răspuns"],
        ["Raluca Stan", "raluca.stan@email.ro", "Clienți", "Invitat"],
        ["Vlad Marinescu", "vlad.marinescu@email.ro", "Presă", "Nu a răspuns"],
        ["Ioana Dumitru", "ioana.dumitru@email.ro", "Echipă", "Nu a răspuns"],
      ],
    },
    commerce: {
      id: "furnizori",
      title: "Furnizori, buget și logistică. Totul conectat.",
      lead: "Compari oferte, gestionezi contracte și plăți, urmărești bugetul și ții logistica sub control.",
      link: "Vezi furnizorii și bugetul",
      vendorsTitle: "Furnizori",
      budgetTitle: "Buget",
      vendors: [
        {
          name: "Bright Vision",
          category: "Foto-Video",
          price: "12.800",
          availability: "Disponibil",
          rating: 4,
          paymentTerm: "30 zile",
          recommended: true,
        },
        {
          name: "SoundPro",
          category: "Tehnic",
          price: "14.200",
          availability: "Disponibil",
          rating: 4,
          paymentTerm: "30 zile",
          recommended: false,
        },
        {
          name: "LightArt",
          category: "Lighting",
          price: "11.900",
          availability: "Parțial",
          rating: 4,
          paymentTerm: "15 zile",
          recommended: false,
        },
      ],
      budgetTotal: "120.000 RON",
      budgetSpent: "81.600 RON",
      budgetSpentPercent: "68%",
      budgetRows: [
        ["Locație", "36.000 RON", "90%"],
        ["Tehnic", "10.400 RON", "61%"],
        ["Catering", "16.800 RON", "70%"],
        ["Marketing", "6.900 RON", "46%"],
        ["Altele", "3.500 RON", "35%"],
      ],
    },
    operations: {
      id: "ziua-evenimentului",
      title: "În ziua evenimentului, ai control total.",
      lead: "Urmărești programul, echipa, furnizorii și statusul în timp real, dintr-un singur loc.",
      link: "Vezi comanda evenimentului",
      surfaceTitle: "Comanda evenimentului",
      schedule: [
        ["08:00", "Sosire echipă tehnică", false],
        ["09:30", "Setup și testare", false],
        ["11:00", "Primirea invitaților", false],
        ["12:00", "Deschidere eveniment", true],
        ["13:00", "Sesiune 1", false],
        ["14:30", "Pauză de prânz", false],
      ],
      team: [
        [
          "Ioana Popescu",
          "Project Manager",
          "Online",
          "/marketing/operations/ioana.png",
        ],
        [
          "Radu Toma",
          "Logistică",
          "Online",
          "/marketing/operations/radu.png",
        ],
        [
          "Elena Dinu",
          "Catering",
          "Online",
          "/marketing/operations/elena.png",
        ],
        [
          "Andrei M.",
          "Tehnic",
          "Pe teren",
          "/marketing/operations/andrei.png",
        ],
        ["Vlad M.", "Host", "Pe teren", "/marketing/operations/vlad.png"],
      ],
      vendors: [
        [
          "Bright Vision",
          "Foto-Video",
          "La fața locului",
          "/marketing/operations/bright-vision.png",
        ],
        [
          "SoundPro",
          "Tehnic",
          "La fața locului",
          "/marketing/operations/soundpro.png",
        ],
        [
          "GastroPlus",
          "Catering",
          "La fața locului",
          "/marketing/operations/gastroplus.png",
        ],
        [
          "City Events",
          "Transport",
          "Pe drum",
          "/marketing/operations/city-events.png",
        ],
      ],
    },
  },
  close: {
    title: "Un singur fir. Zero haos. Evenimente impecabile.",
  },
} as const;

export const assuranceItems = [
  {
    title: "Îl încerci fără presiune.",
    detail: "Plan gratuit, fără card.",
    accent: "coral",
  },
  {
    title: "Știi de la început.",
    detail: "Costul este clar înainte de plată.",
    accent: "sun",
  },
  {
    title: "Rămâi pentru că îți place.",
    detail: "Poți anula oricând.",
    accent: "sage",
  },
] as const;

export const serviceMarquee = [
  "Planificare",
  "Invitații",
  "RSVP",
  "Furnizori",
  "Buget",
  "Logistică",
  "Coordonare în timp real",
] as const;

export const hero = {
  title: "Fiecare eveniment are sute de detalii. Sarbato le ține împreună.",
  highlight: "Sarbato le ține împreună.",
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
      price: "19 €",
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
      price: "39 €",
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
    q: "Pentru ce tipuri de evenimente pot folosi Sarbato?",
    a: "Sarbato este construit pentru organizarea mai multor tipuri de evenimente. Aceeași structură conectează planul, oamenii, furnizorii, bugetul, logistica și ziua evenimentului într-un singur spațiu.",
  },
  {
    q: "Trebuie să instalez ceva?",
    a: "Nu. Sarbato funcționează direct în browser. Îți creezi contul, deschizi spațiul evenimentului și lucrezi de acolo.",
  },
  {
    q: "Cum rămân conectate toate modulele?",
    a: "Planificarea, invitațiile, furnizorii, bugetul și coordonarea din ziua evenimentului folosesc același fir operațional. Activitățile, responsabilitățile, răspunsurile și stările pot fi urmărite din același spațiu de lucru.",
  },
  {
    q: "Invitații trebuie să își creeze cont?",
    a: "Nu. Invitații folosesc linkul primit pentru confirmare, meniu și informațiile logistice publicate pentru ei.",
  },
  {
    q: "Pot lucra împreună cu partenerul sau echipa?",
    a: "Da. Membrii echipei primesc acces potrivit rolului lor și lucrează din aceeași versiune a planului, cu responsabilități și stări vizibile în același spațiu.",
  },
  {
    q: "Ce informații văd invitații și furnizorii?",
    a: "Fiecare vede suprafața și informațiile potrivite rolului său. Planul intern, răspunsurile, bugetul și informațiile operaționale rămân în spațiul autorizat; conținutul devine public numai când îl publici intenționat.",
  },
  {
    q: "Sarbato procesează plățile către furnizori?",
    a: "Nu. Sarbato nu deține fonduri și nu transferă bani între organizatori și furnizori. Plata se face direct prin metoda stabilită între părți.",
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

export const contactPage = {
  eyebrow: "Contact Sarbato",
  title: "Spune-ne ce pregătești. Pornim de la întrebarea ta.",
  lead: "Fie că vrei să înțelegi produsul, ai nevoie de ajutor cu accesul sau vrei să discutăm o colaborare, scrie-ne cât mai concret.",
  email: "hello@sarbato.space",
  directTitle: "Preferi un mesaj direct?",
  directLead: "Poți scrie oricând pe email. Nu include parole, date de card sau alte informații sensibile.",
  faqLabel: "Pentru răspunsuri rapide",
  faqLink: "Vezi întrebările frecvente",
  form: {
    eyebrow: "Mesaj nou",
    title: "Cu ce te putem ajuta?",
    nameLabel: "Nume",
    namePlaceholder: "Cum te numești",
    emailLabel: "Email",
    emailPlaceholder: "nume@exemplu.ro",
    topicLabel: "Subiect",
    topics: [
      "Întrebare despre produs",
      "Ajutor cu accesul",
      "Colaborare",
      "Altceva",
    ],
    messageLabel: "Mesaj",
    messagePlaceholder:
      "Spune-ne ce organizezi, ce vrei să rezolvi și unde ai nevoie de claritate.",
    submitLabel: "Deschide mesajul în email",
    note: "Butonul pregătește mesajul în aplicația ta de email. Nu îl trimitem automat.",
    prepared: "Mesajul este pregătit. Confirmă trimiterea din aplicația ta de email.",
  },
  pathsTitle: "Ajută-ne să păstrăm firul scurt.",
  pathsLead:
    "Alege subiectul potrivit și include detaliile care ne ajută să înțelegem situația din prima.",
  paths: [
    {
      title: "Produs și organizare",
      body: "Spune-ne tipul evenimentului și ce ai vrea să coordonezi mai simplu.",
    },
    {
      title: "Cont și acces",
      body: "Include adresa contului și descrie pasul la care te-ai blocat, fără parolă.",
    },
    {
      title: "Colaborări",
      body: "Prezintă pe scurt ideea, rolul tău și forma de colaborare pe care o propui.",
    },
  ],
} as const;

export const footer = {
  title: "Tot evenimentul rămâne legat, până la ultimul detaliu.",
  tagline:
    "Planificare, invitații, furnizori, buget și coordonare într-un singur fir.",
  note: "Pentru orice eveniment. Direct în browser.",
  action: primaryCta,
  columns: [
    {
      title: "Explorează",
      links: [
        { label: "Produs", href: "/produs" },
        { label: "Soluții", href: "/#solutii" },
        { label: "Prețuri", href: "/#abonamente" },
        { label: "Întrebări", href: "/#intrebari" },
        { label: "Despre noi", href: "/#despre" },
        { label: "Contact", href: routes.contact },
      ],
    },
    {
      title: "Capabilități",
      links: [
        { label: "Planificare", href: "/#planificare" },
        { label: "Invitații", href: "/#invitatii" },
        { label: "Furnizori și buget", href: "/#furnizori" },
        { label: "Ziua evenimentului", href: "/#ziua-evenimentului" },
      ],
    },
    {
      title: "În aplicație",
      links: [
        { label: "Plan", href: "/plan" },
        { label: "Invitații", href: "/invitations" },
        { label: "Buget", href: "/budget" },
        { label: "Marketplace", href: "/marketplace" },
      ],
    },
    {
      title: "Cont",
      links: [
        { label: primaryCta.label, href: primaryCta.href },
        { label: signInCta.label, href: signInCta.href },
      ],
    },
  ],
  legal: [
    { label: "Confidențialitate", href: routes.privacy },
    { label: "Termeni", href: routes.terms },
    { label: "Rambursări", href: routes.refunds },
    { label: "Cookie-uri", href: routes.cookies },
  ],
} as const;
