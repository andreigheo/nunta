/**
 * The server returns preflight codes with mixed-language messages. The editor
 * owns the Romanian copy and decides where each blocker is actually fixed.
 */
export type InvitationPreflightAction =
  | { kind: "route"; href: string; label: string }
  | { kind: "starter-section"; label: string }
  | { kind: "workflow"; label: string }
  | { kind: "save"; label: string }
  | { kind: "none" };

export type InvitationPreflightGuide = {
  title: string;
  detail: string;
  action: InvitationPreflightAction;
};

export function invitationPreflightGuide(
  code: string,
  fallbackMessage: string,
): InvitationPreflightGuide {
  switch (code) {
    case "RSVP_FORM_NOT_PUBLISHED":
      return {
        title: "Formularul RSVP nu este publicat",
        detail:
          "Invitația are un îndemn de confirmare, dar formularul separat nu este publicat. Publică formularul sau elimină îndemnul RSVP din invitație.",
        action: { kind: "route", href: "/rsvp", label: "Deschide RSVP" },
      };
    case "GUEST_EVENT_MISSING":
      return {
        title: "Lipsește un moment vizibil invitaților",
        detail:
          "Invitația are nevoie de cel puțin un moment confirmat, vizibil invitaților și cu RSVP activ. Momentele evenimentului nu se adaugă din editorul de invitații, deci această verificare nu se poate rezolva de aici.",
        action: { kind: "none" },
      };
    case "INVITATION_STARTER_CONTENT":
      return {
        title: "Există încă text demonstrativ",
        detail:
          "Exemplele cu care pornește invitația trebuie înlocuite sau ascunse înainte de publicare.",
        action: {
          kind: "starter-section",
          label: "Deschide secțiunea",
        },
      };
    case "VARIANT_STARTER_CONTENT":
      return {
        title: "O variantă are încă text demonstrativ",
        detail:
          "Una dintre variante păstrează exemple din invitația de pornire. Deschide varianta și înlocuiește textul.",
        action: { kind: "workflow", label: "Deschide variantele" },
      };
    case "VARIANT_DRAFT_MISSING":
      return {
        title: "O variantă activă nu are conținut publicabil",
        detail:
          "Varianta există, dar nu are nicio versiune salvată. Salvează-i o ciornă sau arhivează-o.",
        action: { kind: "workflow", label: "Deschide variantele" },
      };
    case "VARIANT_SECTION_MISSING":
      return {
        title: "O variantă indică secțiuni care nu mai există",
        detail:
          "Ai șters din invitația de bază o secțiune pe care o variantă o modifica. Deschide varianta ca să o aliniezi.",
        action: { kind: "workflow", label: "Deschide variantele" },
      };
    case "RECIPIENT_VARIANT_UNAVAILABLE":
      return {
        title: "Un destinatar e legat de o variantă indisponibilă",
        detail:
          "Varianta a fost arhivată sau ștearsă. Mută destinatarii pe invitația de bază sau pe o variantă activă.",
        action: {
          kind: "route",
          href: "/invitations",
          label: "Deschide destinatarii",
        },
      };
    case "INVITATION_MEDIA_INVALID":
    case "INVITATION_MEDIA_UNAVAILABLE":
      return {
        title: "O imagine nu este disponibilă",
        detail:
          "O imagine a fost ștearsă, se verifică încă în fundal sau nu provine din biblioteca invitației. Reîncarcă imaginea în secțiunea care o folosește.",
        action: { kind: "none" },
      };
    case "VARIANT_MEDIA_INVALID":
    case "VARIANT_MEDIA_UNAVAILABLE":
      return {
        title: "O variantă folosește o imagine indisponibilă",
        detail:
          "Deschide varianta și reîncarcă imaginea din biblioteca invitației.",
        action: { kind: "workflow", label: "Deschide variantele" },
      };
    case "INVITATION_SITE_MISSING":
    case "INVITATION_DRAFT_MISSING":
      return {
        title: "Ciorna nu a ajuns încă pe server",
        detail:
          "Salvează o dată invitația, apoi verificarea se reia automat.",
        action: { kind: "save", label: "Salvează ciorna" },
      };
    case "NO_RECIPIENTS":
      return {
        title: "Invitația nu are încă destinatari",
        detail:
          "Poți publica și fără destinatari, dar nimeni nu primește invitația până când nu pregătești linkurile personale.",
        action: {
          kind: "route",
          href: "/invitations",
          label: "Pregătește destinatarii",
        },
      };
    default:
      return {
        title: "Verificare nepromovată de server",
        detail: fallbackMessage,
        action: { kind: "none" },
      };
  }
}
