import type { Vendor, Booking, Offer, Contract } from "@/lib/types";

export const vendors: Vendor[] = [
  { id: "v-1", name: "Andrei Dăscălescu", category: "Fotograf", city: "Brașov", verified: true, rating: 4.9, reviews: 87, startingPrice: 6_500, availableOnDate: true, responseTime: "< 2 ore", styles: ["Documentar", "Editorial"], description: "Fotografie de nuntă cu accent pe momente reale și lumină naturală. Peste 140 de nunți fotografiate în Transilvania.", favorite: true },
  { id: "v-2", name: "Studio Nord Film", category: "Videograf", city: "Brașov", verified: true, rating: 4.8, reviews: 62, startingPrice: 3_800, availableOnDate: true, responseTime: "< 4 ore", styles: ["Cinematic", "Documentar"], description: "Filme de nuntă cinematice, cu dronă și două camere. Livrare teaser în 7 zile.", favorite: true },
  { id: "v-3", name: "DJ Marius Tone", category: "DJ & Muzică", city: "Brașov", verified: true, rating: 4.7, reviews: 119, startingPrice: 4_200, availableOnDate: true, responseTime: "< 1 oră", styles: ["Comercial", "Retro", "Latino"], description: "DJ cu 12 ani de experiență în nunți, sonorizare proprie pentru exterior și lumini incluse." },
  { id: "v-4", name: "Formatia Acord", category: "DJ & Muzică", city: "Sibiu", verified: false, rating: 4.6, reviews: 54, startingPrice: 7_800, availableOnDate: true, responseTime: "1 zi", styles: ["Live", "Populară", "Lăutărească"], description: "Formație live de 6 persoane, repertoriu mixt — de la muzică populară la hituri internaționale." },
  { id: "v-5", name: "Atelier Floral Iris", category: "Florist", city: "Brașov", verified: true, rating: 4.9, reviews: 73, startingPrice: 5_000, availableOnDate: true, responseTime: "< 6 ore", styles: ["Grădină englezească", "Romantic"], description: "Flori de sezon din producție locală, aranjamente voluminoase în stil grădină englezească.", favorite: true },
  { id: "v-6", name: "Blooming Days", category: "Florist", city: "București", verified: true, rating: 4.7, reviews: 91, startingPrice: 7_500, availableOnDate: true, responseTime: "< 12 ore", styles: ["Modern", "Minimal"], description: "Studio de design floral pentru evenimente premium, cu deplasare în toată țara." },
  { id: "v-7", name: "Conacul Ambient", category: "Locație", city: "Cristian, Brașov", verified: true, rating: 4.8, reviews: 204, startingPrice: 38_000, availableOnDate: true, responseTime: "< 24 ore", styles: ["Conac", "Grădină", "Rustic elegant"], description: "Conac istoric cu grădină de 2 ha, capacitate 220 invitați, cazare pentru 40 de persoane.", favorite: true },
  { id: "v-8", name: "Catering Gust & Grație", category: "Catering", city: "Brașov", verified: true, rating: 4.6, reviews: 58, startingPrice: 240, availableOnDate: true, responseTime: "< 8 ore", styles: ["Românesc modern", "Internațional"], description: "Catering premium cu meniuri degustare și opțiuni extinse pentru regimuri speciale." },
  { id: "v-9", name: "Dulce Atelier", category: "Tort & Dulciuri", city: "Brașov", verified: false, rating: 4.8, reviews: 46, startingPrice: 1_900, availableOnDate: true, responseTime: "< 4 ore", styles: ["Floral", "Minimal"], description: "Torturi de nuntă cu flori naturale și candy bar personalizat." },
  { id: "v-10", name: "Lumina Events", category: "Decor", city: "Brașov", verified: true, rating: 4.5, reviews: 39, startingPrice: 2_800, availableOnDate: true, responseTime: "1 zi", styles: ["Ambiental", "Industrial chic"], description: "Iluminat arhitectural pentru grădini și săli de evenimente, ghirlande și proiecții." },
  { id: "v-11", name: "Cabina Retro Brașov", category: "Foto cabină", city: "Brașov", verified: false, rating: 4.7, reviews: 28, startingPrice: 1_600, availableOnDate: false, responseTime: "< 6 ore", styles: ["Retro", "Polaroid"], description: "Cabină foto vintage cu imprimare instant și album de mesaje pentru miri." },
  { id: "v-12", name: "TransBus Premium", category: "Transport", city: "Brașov", verified: true, rating: 4.6, reviews: 82, startingPrice: 1_800, availableOnDate: true, responseTime: "< 2 ore", styles: ["Autocare", "Microbuze"], description: "Transport oaspeți cu autocare moderne, șoferi profesioniști, program flexibil." },
];

export const offers: Offer[] = [
  { id: "of-1", vendorName: "DJ Marius Tone", category: "DJ & Muzică", status: "reviewing", basePrice: 6_200, vatIncluded: true, receivedAt: "2026-07-14", validUntil: "2026-07-31", highlights: ["Sonorizare exterior inclusă", "8 ore acoperite", "Lumini de scenă incluse"], concerns: ["Ore suplimentare scumpe (650 lei/h)"] },
  { id: "of-2", vendorName: "Formatia Acord", category: "DJ & Muzică", status: "new", basePrice: 9_400, vatIncluded: false, receivedAt: "2026-07-16", validUntil: "2026-08-05", highlights: ["Formație live 6 persoane", "Două seturi de câte 2 ore"], concerns: ["TVA 19% neinclus", "Necesită masă pentru 6 persoane", "Spațiu scenă 4x3m"] },
  { id: "of-3", vendorName: "Atelier Floral Iris", category: "Florist", status: "clarification", basePrice: 13_800, vatIncluded: true, receivedAt: "2026-07-11", validUntil: "2026-07-28", highlights: ["Flori locale de sezon", "Include buchet mireasă și 12 aranjamente mese"], concerns: ["Transport neclarificat", "Montaj/demontaj neinclus"] },
  { id: "of-4", vendorName: "Catering Gust & Grație", category: "Catering", status: "negotiating", basePrice: 41_600, vatIncluded: true, receivedAt: "2026-07-06", validUntil: "2026-08-10", highlights: ["260 lei/persoană meniu standard", "Degustare inclusă pentru 4 persoane", "Personal 1 la 12 invitați"] },
];

export const bookings: Booking[] = [
  { id: "bk-1", vendorName: "Conacul Ambient", category: "Locație", stage: "deposit-paid", value: 43_500, owner: "Mihai", nextAction: "Semnare anexă meniu", deadline: "2026-07-28" },
  { id: "bk-2", vendorName: "Andrei Dăscălescu", category: "Fotograf", stage: "deposit-paid", value: 8_800, owner: "Mihai", nextAction: "Plată rata 2", deadline: "2026-08-01" },
  { id: "bk-3", vendorName: "Studio Nord Film", category: "Videograf", stage: "contracted", value: 4_000, owner: "Ana", nextAction: "Avans 30%", deadline: "2026-09-15" },
  { id: "bk-4", vendorName: "DJ Marius Tone", category: "DJ & Muzică", stage: "quote-received", value: 6_200, owner: "Mihai", nextAction: "Întâlnire online", deadline: "2026-07-21" },
  { id: "bk-5", vendorName: "Formatia Acord", category: "DJ & Muzică", stage: "quote-received", value: 9_400, owner: "Mihai", nextAction: "Comparare cu DJ" },
  { id: "bk-6", vendorName: "Atelier Floral Iris", category: "Florist", stage: "quote-requested", value: 13_800, owner: "Ana", nextAction: "Clarificare transport", deadline: "2026-07-24" },
  { id: "bk-7", vendorName: "Catering Gust & Grație", category: "Catering", stage: "negotiating", value: 41_600, owner: "Elena", nextAction: "Degustare meniu", deadline: "2026-07-25" },
  { id: "bk-8", vendorName: "Dulce Atelier", category: "Tort & Dulciuri", stage: "contacted", value: 2_400, owner: "Ana", nextAction: "Programează degustare" },
];

export const contracts: Contract[] = [
  { id: "ct-1", name: "Contract prestări servicii — locație", vendor: "Conacul Ambient", type: "Locație", value: 43_500, signed: true, signedAt: "2026-05-18", nextPayment: "2027-08-12", nextPaymentAmount: 21_750, riskLevel: "low" },
  { id: "ct-2", name: "Anexă cort ceremonial", vendor: "Conacul Ambient", type: "Locație", value: 5_500, signed: false, nextPayment: "2026-07-10", nextPaymentAmount: 1_250, riskLevel: "medium", expiresAt: "2026-07-31" },
  { id: "ct-3", name: "Contract fotografie 12h", vendor: "Andrei Dăscălescu", type: "Prestări servicii", value: 8_800, signed: true, signedAt: "2026-06-02", nextPayment: "2026-08-01", nextPaymentAmount: 2_000, riskLevel: "low" },
  { id: "ct-4", name: "Contract videografie", vendor: "Studio Nord Film", type: "Prestări servicii", value: 4_000, signed: true, signedAt: "2026-07-01", nextPayment: "2026-09-15", nextPaymentAmount: 1_200, riskLevel: "low" },
  { id: "ct-5", name: "Contract ajustări rochie", vendor: "Atelier Mira", type: "Altele", value: 3_200, signed: true, signedAt: "2026-06-20", nextPayment: "2026-12-01", nextPaymentAmount: 1_600, riskLevel: "low" },
];
