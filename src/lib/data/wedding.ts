import type { Wedding, TeamMember, CalendarEvent, TimelineMilestone } from "@/lib/types";

export const wedding: Wedding = {
  id: "wed-ana-mihai",
  title: "Ana & Mihai",
  partnerOne: "Ana Dumitrescu",
  partnerTwo: "Mihai Ionescu",
  date: "2027-09-12",
  city: "Brașov",
  venueName: "Conacul Ambient, Cristian",
  estimatedGuests: 160,
  targetBudget: 180_000,
  currency: "RON",
  rsvpDeadline: "2027-06-15",
  style: ["Grădină", "Romantic", "Elegant"],
  status: "on-track",
};

export const workspaces: Wedding[] = [
  wedding,
  {
    ...wedding,
    id: "wed-ioana-vlad",
    title: "Ioana & Vlad",
    partnerOne: "Ioana Marinescu",
    partnerTwo: "Vlad Stanciu",
    date: "2028-06-03",
    city: "Sibiu",
    venueName: undefined,
    estimatedGuests: 110,
    targetBudget: 120_000,
    status: "planning",
  },
];

export const teamMembers: TeamMember[] = [
  { id: "tm-1", name: "Ana Dumitrescu", email: "ana.dumitrescu@gmail.com", role: "owner", status: "active", lastActive: "2026-07-17T08:12:00" },
  { id: "tm-2", name: "Mihai Ionescu", email: "mihai.ionescu@outlook.com", role: "partner", status: "active", lastActive: "2026-07-16T21:44:00" },
  { id: "tm-3", name: "Elena Pop", email: "elena@evenimente-cu-rost.ro", role: "planner", status: "active", lastActive: "2026-07-15T15:02:00" },
  { id: "tm-4", name: "Cristina Dumitrescu", email: "cris.dumitrescu@gmail.com", role: "family", status: "active", lastActive: "2026-07-14T10:31:00" },
  { id: "tm-5", name: "Andrei Ionescu", email: "andrei.ionescu@gmail.com", role: "family", status: "invited" },
];

export const upcomingEvents: CalendarEvent[] = [
  { id: "ev-1", title: "Degustare meniu — Conacul Ambient", type: "vendor", date: "2026-07-25", time: "12:00", location: "Cristian, Brașov" },
  { id: "ev-2", title: "Avans fotograf — rata 2", type: "payment", date: "2026-08-01" },
  { id: "ev-3", title: "Ședință online cu DJ Marius Tone", type: "meeting", date: "2026-07-21", time: "18:30" },
  { id: "ev-4", title: "Termen ofertă florar", type: "contract", date: "2026-07-28" },
  { id: "ev-5", title: "Probă rochie — a doua ajustare", type: "meeting", date: "2026-08-08", time: "11:00", location: "Atelier Mira, Brașov" },
  { id: "ev-6", title: "Deadline RSVP invitați", type: "guest", date: "2027-06-15" },
  { id: "ev-7", title: "Finalizare listă invitați — varianta finală", type: "task", date: "2026-09-01" },
  { id: "ev-8", title: "Ziua nunții", type: "wedding", date: "2027-09-12", location: "Conacul Ambient, Cristian" },
];

export const milestones: TimelineMilestone[] = [
  { id: "ms-1", title: "Stabilire buget și listă priorități", phase: "Fundament", month: "2026-05", done: true },
  { id: "ms-2", title: "Rezervare locație", phase: "Fundament", month: "2026-05", done: true, critical: true },
  { id: "ms-3", title: "Rezervare fotograf", phase: "Furnizori cheie", month: "2026-06", done: true, critical: true },
  { id: "ms-4", title: "Alegere DJ / formație", phase: "Furnizori cheie", month: "2026-08", done: false, critical: true },
  { id: "ms-5", title: "Selectare florist & concept decor", phase: "Furnizori cheie", month: "2026-09", done: false, delayed: true },
  { id: "ms-6", title: "Lansare invitații digitale", phase: "Invitați", month: "2026-10", done: false, critical: true },
  { id: "ms-7", title: "Degustare și meniu final", phase: "Experiență", month: "2026-11", done: false },
  { id: "ms-8", title: "Rezervare transport & cazare oaspeți", phase: "Logistică", month: "2027-01", done: false },
  { id: "ms-9", title: "Deadline RSVP", phase: "Invitați", month: "2027-06", done: false, critical: true },
  { id: "ms-10", title: "Plan de mese final", phase: "Logistică", month: "2027-07", done: false },
  { id: "ms-11", title: "Cronometru ziua nunții aprobat", phase: "Ziua nunții", month: "2027-08", done: false, critical: true },
  { id: "ms-12", title: "Ziua nunții", phase: "Ziua nunții", month: "2027-09", done: false, critical: true },
];

export const planningPhases = ["Fundament", "Furnizori cheie", "Invitați", "Experiență", "Logistică", "Ziua nunții"];
