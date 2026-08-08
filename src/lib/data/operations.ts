import type { Risk, AppNotification, ActivityItem } from "@/lib/types";

export const risks: Risk[] = [
  { id: "r-1", title: "Ploaie în ziua ceremoniei în aer liber", category: "Meteo", probability: "medium", impact: "high", owner: "Elena", plan: "Cort de rezervă contractat; anexa trebuie semnată până la 31 iulie.", status: "active" },
  { id: "r-2", title: "Florar neselectat — sezon scurt pentru bujori", category: "Furnizori", probability: "high", impact: "medium", owner: "Ana", plan: "Termen 28 iulie pentru alegere; alternative: dalii și trandafiri de grădină.", status: "active" },
  { id: "r-3", title: "Depășire buget catering cu >10%", category: "Buget", probability: "medium", impact: "high", owner: "Mihai", plan: "Negociere pachet open-bar; scenariu conservator pregătit.", status: "active" },
  { id: "r-4", title: "Capacitate cazare insuficientă în zonă", category: "Logistică", probability: "low", impact: "medium", owner: "Mihai", plan: "Bloc de 20 de camere rezervat până la 15 septembrie.", status: "mitigated" },
  { id: "r-5", title: "Retragere furnizor muzică în ultimul moment", category: "Furnizori", probability: "low", impact: "high", owner: "Elena", plan: "Clauză de penalitate + listă cu 2 DJ de rezervă.", status: "mitigated" },
];

export const notifications: AppNotification[] = [
  { id: "n-1", module: "vendors", title: "Ofertă nouă de la Formatia Acord", description: "Pachet formație live: 9.400 lei + TVA. Valabilă până la 5 august.", time: "2026-07-16T18:24:00", read: false, href: "/offers" },
  { id: "n-2", module: "payments", title: "Plată restantă — Anexă cort", description: "1.250 lei către Conacul Ambient, scadentă pe 10 iulie.", time: "2026-07-16T09:02:00", read: false, href: "/payments" },
  { id: "n-3", module: "tasks", title: "Sarcină depășită: semnare anexă meniu", description: "Termenul era 15 iulie. Blochează finalizarea contractului cu locația.", time: "2026-07-15T14:40:00", read: false, href: "/plan" },
  { id: "n-4", module: "guests", title: "5 confirmări noi RSVP", description: "Familia Nistor și Familia Florea au confirmat participarea.", time: "2026-07-15T11:18:00", read: false, href: "/rsvp" },
  { id: "n-5", module: "vendors", title: "Atelier Floral Iris a răspuns la clarificări", description: "Transportul în Brașov este inclus; montajul costă 900 lei în plus.", time: "2026-07-14T16:55:00", read: true, href: "/offers" },
  { id: "n-6", module: "risks", title: "Risc actualizat: buget catering", description: "Probabilitatea a crescut la medie după ultima ofertă primită.", time: "2026-07-14T10:12:00", read: true, href: "/risks" },
  { id: "n-7", module: "payments", title: "Plată programată în 15 zile", description: "Avans fotograf rata 2 — 2.000 lei, scadent pe 1 august.", time: "2026-07-13T08:30:00", read: true, href: "/payments" },
  { id: "n-8", module: "system", title: "Invitație echipă trimisă", description: "Andrei Ionescu a fost invitat ca membru al familiei.", time: "2026-07-12T19:45:00", read: true, href: "/team" },
  { id: "n-9", module: "tasks", title: "Elena a finalizat „Plan B ceremonie”", description: "Documentul cu scenariul de ploaie este atașat la sarcină.", time: "2026-07-11T13:20:00", read: true, href: "/plan" },
  { id: "n-10", module: "guests", title: "31 de invitați fără meniu selectat", description: "Trimite o reamintire înainte de degustarea din 25 iulie.", time: "2026-07-10T09:15:00", read: true, href: "/menus" },
];

export const activity: ActivityItem[] = [
  { id: "a-1", user: "Ana", action: "a adăugat 12 imagini în moodboardul „Grădină de seară”", module: "Design Studio", time: "2026-07-16T21:14:00", href: "/moodboards" },
  { id: "a-2", user: "Mihai", action: "a comparat ofertele pentru muzică", module: "Oferte", time: "2026-07-16T18:02:00", href: "/offers" },
  { id: "a-3", user: "Elena", action: "a finalizat sarcina „Plan B ceremonie”", module: "Plan", time: "2026-07-16T12:40:00", href: "/plan" },
  { id: "a-4", user: "Ana", action: "a trimis cerere de ofertă către Blooming Days", module: "Furnizori", time: "2026-07-15T17:28:00", href: "/requests" },
  { id: "a-5", user: "Cristina", action: "a comentat la „Finalizează lista de invitați”", module: "Plan", time: "2026-07-15T10:05:00", href: "/plan" },
  { id: "a-6", user: "Mihai", action: "a marcat plata „Avans fotograf rata 1” ca efectuată", module: "Buget", time: "2026-07-14T08:52:00", href: "/payments" },
  { id: "a-7", user: "Ana", action: "a actualizat meniul pentru Familia Enache (vegan)", module: "Invitați", time: "2026-07-13T19:31:00", href: "/guests" },
  { id: "a-8", user: "Elena", action: "a creat 4 sarcini din șablonul „Logistică oaspeți”", module: "Plan", time: "2026-07-12T15:47:00", href: "/plan" },
];
