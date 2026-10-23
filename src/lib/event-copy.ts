import type { EventType } from "@weddingos/contracts";

/** Labels change with the occasion; persisted compatibility values stay stable. */
export function guestSideLabels(eventType?: EventType) {
  return {
    PARTNER_ONE: eventType === "wedding" ? "Partener 1" : "Organizator",
    PARTNER_TWO: eventType === "wedding" ? "Partener 2" : "Coorganizator",
    COMMON: eventType === "wedding" ? "Comună" : "Lista comună",
    VENDOR: "Furnizor",
    OTHER: "Altele",
  };
}

export function initialRsvpQuestions(eventType?: EventType) {
  const familyEvent = ["wedding", "baptism", "birthday", "anniversary", "private_party"].includes(eventType ?? "");
  return {
    plusOneQuestion: familyEvent,
    childrenConfirmation: familyEvent,
    menuSelection: false,
    allergyCollection: true,
    accessibilityCollection: true,
    transportQuestion: false,
    accommodationQuestion: false,
  };
}
