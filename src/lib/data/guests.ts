import type { Guest, Household } from "@/lib/types";

export const households: Household[] = [
  { id: "hh-1", name: "Familia Popescu", city: "Brașov", language: "ro" },
  { id: "hh-2", name: "Familia Stan", city: "București", language: "ro" },
  { id: "hh-3", name: "Familia Enache", city: "Cluj-Napoca", language: "ro" },
  { id: "hh-4", name: "Familia Radu", city: "Brașov", language: "ro" },
  { id: "hh-5", name: "Familia Munteanu", city: "Iași", language: "ro" },
  { id: "hh-6", name: "Familia Ciobanu", city: "Sibiu", language: "ro" },
  { id: "hh-7", name: "Familia Florea", city: "București", language: "ro" },
  { id: "hh-8", name: "Familia Nistor", city: "Brașov", language: "ro" },
  { id: "hh-9", name: "Familia Baciu", city: "Timișoara", language: "ro" },
  { id: "hh-10", name: "Familia Marinescu", city: "Constanța", language: "ro" },
  { id: "hh-11", name: "Familia Gheorghe", city: "Brașov", language: "ro" },
  { id: "hh-12", name: "Familia Stoica", city: "Pitești", language: "ro" },
];

export const guests: Guest[] = [
  { id: "g-1", firstName: "Marius", lastName: "Popescu", householdId: "hh-1", side: "mihai", relationship: "Văr", email: "marius.popescu@gmail.com", phone: "+40 722 481 905", invitation: "opened", rsvp: "confirmed", menu: "standard", transportNeeded: false, accommodationNeeded: false, tableId: "tb-1", events: ["ceremonie", "petrecere"], lastContact: "2026-07-10" },
  { id: "g-2", firstName: "Elena", lastName: "Popescu", householdId: "hh-1", side: "mihai", relationship: "Văr", email: "elena.popescu@gmail.com", invitation: "opened", rsvp: "confirmed", menu: "vegetarian", allergies: "Nuci", transportNeeded: false, accommodationNeeded: false, tableId: "tb-1", events: ["ceremonie", "petrecere"], lastContact: "2026-07-10" },
  { id: "g-3", firstName: "Rareș", lastName: "Popescu", householdId: "hh-1", side: "mihai", relationship: "Văr (copil)", isChild: true, invitation: "opened", rsvp: "confirmed", menu: "copii", transportNeeded: false, accommodationNeeded: false, tableId: "tb-1", events: ["petrecere"] },
  { id: "g-4", firstName: "Victor", lastName: "Stan", householdId: "hh-2", side: "ana", relationship: "Unchi", email: "victor.stan@yahoo.com", phone: "+40 745 220 118", invitation: "delivered", rsvp: "confirmed", menu: "standard", transportNeeded: true, accommodationNeeded: true, events: ["ceremonie", "petrecere"], lastContact: "2026-07-08" },
  { id: "g-5", firstName: "Mariana", lastName: "Stan", householdId: "hh-2", side: "ana", relationship: "Mătușă", invitation: "delivered", rsvp: "confirmed", menu: "fara-gluten", allergies: "Gluten", transportNeeded: true, accommodationNeeded: true, events: ["ceremonie", "petrecere"], lastContact: "2026-07-08" },
  { id: "g-6", firstName: "Alexandra", lastName: "Enache", householdId: "hh-3", side: "ana", relationship: "Prietenă facultate", email: "alex.enache@gmail.com", invitation: "opened", rsvp: "confirmed", menu: "vegan", transportNeeded: true, accommodationNeeded: true, events: ["ceremonie", "petrecere"], lastContact: "2026-07-12" },
  { id: "g-7", firstName: "Daria", lastName: "Enache", householdId: "hh-3", side: "ana", relationship: "Plus-unu", isPlusOne: true, invitation: "opened", rsvp: "confirmed", menu: "standard", transportNeeded: true, accommodationNeeded: true, events: ["petrecere"] },
  { id: "g-8", firstName: "Bogdan", lastName: "Radu", householdId: "hh-4", side: "mihai", relationship: "Prieten copilărie", email: "bogdan.radu@gmail.com", phone: "+40 733 890 441", invitation: "opened", rsvp: "confirmed", menu: "standard", transportNeeded: false, accommodationNeeded: false, tableId: "tb-2", events: ["ceremonie", "petrecere"], lastContact: "2026-07-11" },
  { id: "g-9", firstName: "Ioana", lastName: "Radu", householdId: "hh-4", side: "mihai", relationship: "Soția lui Bogdan", invitation: "opened", rsvp: "confirmed", menu: "vegetarian", transportNeeded: false, accommodationNeeded: false, tableId: "tb-2", events: ["ceremonie", "petrecere"] },
  { id: "g-10", firstName: "Dan", lastName: "Munteanu", householdId: "hh-5", side: "ana", relationship: "Coleg serviciu", email: "dan.munteanu@corp.ro", invitation: "sent", rsvp: "no-response", menu: "none", transportNeeded: true, accommodationNeeded: true, events: ["ceremonie", "petrecere"] },
  { id: "g-11", firstName: "Carmen", lastName: "Munteanu", householdId: "hh-5", side: "ana", relationship: "Soția lui Dan", invitation: "sent", rsvp: "no-response", menu: "none", transportNeeded: true, accommodationNeeded: true, events: ["ceremonie", "petrecere"] },
  { id: "g-12", firstName: "Paul", lastName: "Ciobanu", householdId: "hh-6", side: "mihai", relationship: "Coleg echipă", email: "paul.ciobanu@gmail.com", invitation: "opened", rsvp: "unsure", menu: "none", transportNeeded: false, accommodationNeeded: false, events: ["petrecere"], lastContact: "2026-07-05" },
  { id: "g-13", firstName: "Simona", lastName: "Florea", householdId: "hh-7", side: "ana", relationship: "Nașă de botez", email: "simona.florea@gmail.com", phone: "+40 721 664 207", invitation: "opened", rsvp: "confirmed", menu: "standard", transportNeeded: true, accommodationNeeded: true, tableId: "tb-3", events: ["ceremonie", "petrecere"], lastContact: "2026-07-14" },
  { id: "g-14", firstName: "George", lastName: "Florea", householdId: "hh-7", side: "ana", relationship: "Naș de botez", invitation: "opened", rsvp: "confirmed", menu: "standard", allergies: "Fructe de mare", transportNeeded: true, accommodationNeeded: true, tableId: "tb-3", events: ["ceremonie", "petrecere"] },
  { id: "g-15", firstName: "Ilinca", lastName: "Nistor", householdId: "hh-8", side: "mihai", relationship: "Sora", email: "ilinca.nistor@gmail.com", invitation: "opened", rsvp: "confirmed", menu: "standard", transportNeeded: false, accommodationNeeded: false, tableId: "tb-3", events: ["ceremonie", "petrecere"], lastContact: "2026-07-15" },
  { id: "g-16", firstName: "Vlad", lastName: "Nistor", householdId: "hh-8", side: "mihai", relationship: "Cumnat", invitation: "opened", rsvp: "confirmed", menu: "standard", transportNeeded: false, accommodationNeeded: false, tableId: "tb-3", events: ["ceremonie", "petrecere"] },
  { id: "g-17", firstName: "Teo", lastName: "Nistor", householdId: "hh-8", side: "mihai", relationship: "Nepot", isChild: true, invitation: "opened", rsvp: "confirmed", menu: "copii", transportNeeded: false, accommodationNeeded: false, tableId: "tb-3", events: ["petrecere"] },
  { id: "g-18", firstName: "Oana", lastName: "Baciu", householdId: "hh-9", side: "ana", relationship: "Prietenă liceu", email: "oana.baciu@gmail.com", invitation: "delivered", rsvp: "no-response", menu: "none", transportNeeded: true, accommodationNeeded: true, events: ["ceremonie", "petrecere"] },
  { id: "g-19", firstName: "Cătălin", lastName: "Marinescu", householdId: "hh-10", side: "mihai", relationship: "Prieten sală", email: "catalin.marinescu@gmail.com", invitation: "opened", rsvp: "declined", menu: "none", transportNeeded: false, accommodationNeeded: false, events: [], lastContact: "2026-07-02", notes: "Este în afara țării în septembrie." },
  { id: "g-20", firstName: "Raluca", lastName: "Gheorghe", householdId: "hh-11", side: "ana", relationship: "Verișoară", email: "raluca.gheorghe@gmail.com", invitation: "opened", rsvp: "confirmed", menu: "vegetarian", transportNeeded: false, accommodationNeeded: false, tableId: "tb-4", events: ["ceremonie", "petrecere"] },
  { id: "g-21", firstName: "Sorin", lastName: "Gheorghe", householdId: "hh-11", side: "ana", relationship: "Soțul Ralucăi", invitation: "opened", rsvp: "confirmed", menu: "standard", transportNeeded: false, accommodationNeeded: false, tableId: "tb-4", events: ["ceremonie", "petrecere"] },
  { id: "g-22", firstName: "Mara", lastName: "Gheorghe", householdId: "hh-11", side: "ana", relationship: "Fiică", isChild: true, invitation: "opened", rsvp: "confirmed", menu: "copii", allergies: "Lactoză", transportNeeded: false, accommodationNeeded: false, tableId: "tb-4", events: ["petrecere"] },
  { id: "g-23", firstName: "Adrian", lastName: "Stoica", householdId: "hh-12", side: "mihai", relationship: "Coleg master", email: "adrian.stoica@gmail.com", invitation: "sent", rsvp: "no-response", menu: "none", transportNeeded: true, accommodationNeeded: true, events: ["ceremonie", "petrecere"] },
  { id: "g-24", firstName: "Diana", lastName: "Stoica", householdId: "hh-12", side: "mihai", relationship: "Soția lui Adrian", invitation: "sent", rsvp: "no-response", menu: "none", transportNeeded: true, accommodationNeeded: true, events: ["ceremonie", "petrecere"] },
];

/** Aggregate figures for the full 160-guest list (demo snapshot). */
export const guestStats = {
  total: 160,
  households: 74,
  invited: 138,
  confirmed: 104,
  declined: 9,
  noResponse: 25,
  children: 18,
  plusOnes: 12,
  menuIncomplete: 31,
  transportNeeded: 46,
  accommodationNeeded: 58,
  unresolvedAllergies: 4,
};
