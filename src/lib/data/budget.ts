import type { BudgetCategory, Expense, Payment } from "@/lib/types";

export const budgetCategories: BudgetCategory[] = [
  { id: "bc-1", name: "Locație", icon: "landmark", planned: 45_000, estimated: 44_000, contracted: 43_500, paid: 21_750 },
  { id: "bc-2", name: "Catering & Băuturi", icon: "utensils", planned: 52_000, estimated: 54_500, contracted: 0, paid: 0 },
  { id: "bc-3", name: "Foto & Video", icon: "camera", planned: 14_000, estimated: 13_200, contracted: 12_800, paid: 4_000 },
  { id: "bc-4", name: "Muzică & Divertisment", icon: "music", planned: 9_000, estimated: 9_800, contracted: 0, paid: 0 },
  { id: "bc-5", name: "Decor & Flori", icon: "flower", planned: 16_000, estimated: 17_500, contracted: 0, paid: 0 },
  { id: "bc-6", name: "Modă & Beauty", icon: "sparkles", planned: 12_000, estimated: 11_000, contracted: 3_200, paid: 1_600 },
  { id: "bc-7", name: "Transport", icon: "bus", planned: 4_500, estimated: 4_200, contracted: 0, paid: 0 },
  { id: "bc-8", name: "Cazare oaspeți", icon: "bed", planned: 8_000, estimated: 7_600, contracted: 0, paid: 0 },
  { id: "bc-9", name: "Invitații & Papetărie", icon: "mail", planned: 3_500, estimated: 3_100, contracted: 0, paid: 0 },
  { id: "bc-10", name: "Diverse & Rezervă", icon: "shield", planned: 16_000, estimated: 16_000, contracted: 0, paid: 0 },
];

export const expenses: Expense[] = [
  { id: "ex-1", name: "Închiriere conac + gradină", categoryId: "bc-1", vendor: "Conacul Ambient", estimated: 38_000, contracted: 38_000, actual: 0, paid: 19_000, dueDate: "2027-08-12", status: "partially-paid" },
  { id: "ex-2", name: "Cort ceremonial (rezervă meteo)", categoryId: "bc-1", vendor: "Conacul Ambient", estimated: 6_000, contracted: 5_500, actual: 0, paid: 2_750, dueDate: "2026-10-01", status: "partially-paid" },
  { id: "ex-3", name: "Meniu 160 pers. — standard", categoryId: "bc-2", estimated: 44_800, contracted: 0, actual: 0, paid: 0, status: "quoted" },
  { id: "ex-4", name: "Open bar 6 ore", categoryId: "bc-2", estimated: 9_700, contracted: 0, actual: 0, paid: 0, status: "estimate" },
  { id: "ex-5", name: "Fotograf — pachet 12h + album", categoryId: "bc-3", vendor: "Andrei Dăscălescu", estimated: 8_800, contracted: 8_800, actual: 0, paid: 4_000, dueDate: "2026-08-01", status: "partially-paid" },
  { id: "ex-6", name: "Videograf — film + teaser", categoryId: "bc-3", estimated: 4_400, contracted: 4_000, actual: 0, paid: 0, dueDate: "2026-09-15", status: "contracted" },
  { id: "ex-7", name: "DJ + sonorizare exterior", categoryId: "bc-4", estimated: 7_500, contracted: 0, actual: 0, paid: 0, status: "quoted" },
  { id: "ex-8", name: "Solist vocal ceremonie", categoryId: "bc-4", estimated: 2_300, contracted: 0, actual: 0, paid: 0, status: "estimate" },
  { id: "ex-9", name: "Aranjamente florale + buchet", categoryId: "bc-5", estimated: 14_000, contracted: 0, actual: 0, paid: 0, status: "estimate" },
  { id: "ex-10", name: "Iluminat ambiental grădină", categoryId: "bc-5", estimated: 3_500, contracted: 0, actual: 0, paid: 0, status: "estimate" },
  { id: "ex-11", name: "Rochie mireasă + ajustări", categoryId: "bc-6", vendor: "Atelier Mira", estimated: 7_200, contracted: 3_200, actual: 0, paid: 1_600, dueDate: "2026-12-01", status: "partially-paid" },
  { id: "ex-12", name: "Costum mire + accesorii", categoryId: "bc-6", estimated: 3_800, contracted: 0, actual: 0, paid: 0, status: "estimate" },
  { id: "ex-13", name: "Autocare oaspeți — 2 curse", categoryId: "bc-7", estimated: 4_200, contracted: 0, actual: 0, paid: 0, status: "estimate" },
  { id: "ex-14", name: "Camere oaspeți — bloc 20 camere", categoryId: "bc-8", estimated: 7_600, contracted: 0, actual: 0, paid: 0, status: "estimate" },
  { id: "ex-15", name: "Invitații digitale + tipărite (40 buc)", categoryId: "bc-9", estimated: 3_100, contracted: 0, actual: 0, paid: 0, status: "estimate" },
];

export const payments: Payment[] = [
  { id: "p-1", name: "Avans fotograf — rata 2", vendor: "Andrei Dăscălescu", categoryId: "bc-3", amount: 2_000, dueDate: "2026-08-01", status: "due-soon", method: "Transfer bancar" },
  { id: "p-2", name: "Anexă cort — diferență avans", vendor: "Conacul Ambient", categoryId: "bc-1", amount: 1_250, dueDate: "2026-07-10", status: "overdue", method: "Transfer bancar" },
  { id: "p-3", name: "Avans videograf — 30%", vendor: "Studio Nord Film", categoryId: "bc-3", amount: 1_200, dueDate: "2026-09-15", status: "upcoming" },
  { id: "p-4", name: "Locație — tranșa finală", vendor: "Conacul Ambient", categoryId: "bc-1", amount: 21_750, dueDate: "2027-08-12", status: "upcoming" },
  { id: "p-5", name: "Ajustări rochie — rest plată", vendor: "Atelier Mira", categoryId: "bc-6", amount: 1_600, dueDate: "2026-12-01", status: "upcoming" },
  { id: "p-6", name: "Avans locație — plătit", vendor: "Conacul Ambient", categoryId: "bc-1", amount: 19_000, dueDate: "2026-05-20", status: "paid", method: "Transfer bancar" },
  { id: "p-7", name: "Avans fotograf — rata 1", vendor: "Andrei Dăscălescu", categoryId: "bc-3", amount: 2_000, dueDate: "2026-06-05", status: "paid", method: "Card" },
];

export const budgetScenarios = [
  { id: "sc-1", name: "Conservator", total: 168_500, note: "Meniuri simplificate, decor redus, fără solist live.", applied: false },
  { id: "sc-2", name: "Realist", total: 180_900, note: "Varianta curentă, cu marjă de 5% pentru imprevizibile.", applied: true },
  { id: "sc-3", name: "Premium", total: 204_700, note: "Bar premium, florarie extinsă, al doilea fotograf.", applied: false },
];
