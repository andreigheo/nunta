import type {
  CapabilityKey,
  WorkspaceSubscriptionRolePolicy,
  WorkspaceSubscriptionPlan,
  WorkspaceSubscriptionPlanKey,
} from "@weddingos/contracts";

export type WorkspaceEntitlements = Record<string, boolean | number>;

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;

export const WORKSPACE_SUBSCRIPTION_PLANS: readonly WorkspaceSubscriptionPlan[] =
  [
    {
      key: "FREE",
      name: "Gratuit",
      description:
        "Planificare esențială pentru un eveniment, fără card și fără perioadă de probă.",
      amountMinor: 0,
      currency: "EUR",
      interval: "month",
      recommended: false,
      features: [
        "Plan, calendar, buget, invitație, RSVP și livrare e-mail",
        "Până la 50 de invitați",
        "2 colaboratori în afara proprietarului",
        "5 acțiuni AI pe lună",
        "200 de livrări e-mail pe lună",
        "250 MB pentru fișiere și imagini",
      ],
      entitlements: {
        MAX_COLLABORATORS: 2,
        MAX_GUESTS: 50,
        AI_ACTIONS_MONTHLY: 5,
        EMAIL_DELIVERIES_MONTHLY: 200,
        MAX_ACTIVE_AUTOMATIONS: 0,
        STORAGE_BYTES: 250 * MEBIBYTE,
        INVITATION_STUDIO: true,
        ADVANCED_LOGISTICS: false,
        VENDOR_COORDINATION: false,
        DOCUMENTS: false,
        AUTOMATIONS: false,
        RISK_AND_CONTINGENCY: false,
        EVENT_DAY_OPERATIONS: false,
        E_SIGNATURES: false,
        ADVANCED_EXPORTS: false,
        PRIORITY_SUPPORT: false,
        VENDOR_PAYMENTS: false,
      },
    },
    {
      key: "PLUS",
      name: "Plus",
      description:
        "Organizare completă, colaborare și logistică pentru majoritatea evenimentelor.",
      amountMinor: 1900,
      currency: "EUR",
      interval: "month",
      recommended: true,
      features: [
        "Tot ce include planul Gratuit",
        "Până la 200 de invitați",
        "5 colaboratori și 2 GB stocare",
        "Mese, transport, cazare și coordonare furnizori",
        "Documente, exporturi și 5 automatizări active",
        "30 de acțiuni AI pe lună",
        "2.000 de livrări e-mail pe lună",
      ],
      entitlements: {
        MAX_COLLABORATORS: 5,
        MAX_GUESTS: 200,
        AI_ACTIONS_MONTHLY: 30,
        EMAIL_DELIVERIES_MONTHLY: 2_000,
        MAX_ACTIVE_AUTOMATIONS: 5,
        STORAGE_BYTES: 2 * GIBIBYTE,
        INVITATION_STUDIO: true,
        ADVANCED_LOGISTICS: true,
        VENDOR_COORDINATION: true,
        DOCUMENTS: true,
        AUTOMATIONS: true,
        RISK_AND_CONTINGENCY: false,
        EVENT_DAY_OPERATIONS: false,
        E_SIGNATURES: false,
        ADVANCED_EXPORTS: true,
        PRIORITY_SUPPORT: false,
        VENDOR_PAYMENTS: false,
      },
    },
    {
      key: "PRO",
      name: "Pro",
      description:
        "Control operațional, automatizare și instrumente avansate pentru echipe exigente.",
      amountMinor: 3900,
      currency: "EUR",
      interval: "month",
      recommended: false,
      features: [
        "Tot ce include planul Plus",
        "Până la 500 de invitați",
        "15 colaboratori și 10 GB stocare",
        "Riscuri, Plan B, check-in și comandament în ziua evenimentului",
        "Coordonare avansată și 25 de automatizări active",
        "150 de acțiuni AI pe lună",
        "10.000 de livrări e-mail pe lună și suport prioritar",
      ],
      entitlements: {
        MAX_COLLABORATORS: 15,
        MAX_GUESTS: 500,
        AI_ACTIONS_MONTHLY: 150,
        EMAIL_DELIVERIES_MONTHLY: 10_000,
        MAX_ACTIVE_AUTOMATIONS: 25,
        STORAGE_BYTES: 10 * GIBIBYTE,
        INVITATION_STUDIO: true,
        ADVANCED_LOGISTICS: true,
        VENDOR_COORDINATION: true,
        DOCUMENTS: true,
        AUTOMATIONS: true,
        RISK_AND_CONTINGENCY: true,
        EVENT_DAY_OPERATIONS: true,
        E_SIGNATURES: true,
        ADVANCED_EXPORTS: true,
        PRIORITY_SUPPORT: true,
        VENDOR_PAYMENTS: false,
      },
    },
  ] as const;

export const WORKSPACE_SUBSCRIPTION_ROLE_POLICY: readonly WorkspaceSubscriptionRolePolicy[] =
  [
    {
      role: "couple_owner",
      name: "Proprietar",
      access: "owner",
      billing: "manage",
      description:
        "Gestionează abonamentul, membrii și toate funcțiile incluse în plan.",
    },
    {
      role: "couple_partner",
      name: "Partener",
      access: "operate",
      billing: "read",
      description:
        "Lucrează în toate modulele planului; poate vedea abonamentul, dar nu îl poate schimba.",
    },
    {
      role: "wedding_planner",
      name: "Planner",
      access: "operate",
      billing: "none",
      description:
        "Coordonează operațional modulele permise de plan și de delegarea proprietarului.",
    },
    {
      role: "family_collaborator",
      name: "Colaborator",
      access: "collaborate",
      billing: "none",
      description:
        "Contribuie numai în zonele delegate; nu vede și nu gestionează facturarea.",
    },
    {
      role: "viewer",
      name: "Vizualizator",
      access: "view",
      billing: "none",
      description:
        "Are acces doar la citire în zonele permise, indiferent de plan.",
    },
  ];

export function workspacePlan(
  key: WorkspaceSubscriptionPlanKey,
): WorkspaceSubscriptionPlan {
  const plan = WORKSPACE_SUBSCRIPTION_PLANS.find(
    (candidate) => candidate.key === key,
  );
  if (!plan) throw new Error(`Unknown workspace subscription plan: ${key}`);
  return plan;
}

export function effectiveWorkspacePlanKey(
  planKey: WorkspaceSubscriptionPlanKey | null | undefined,
  status: string | null | undefined,
  gracePeriodEndAt?: Date | string | null,
  now = new Date(),
): WorkspaceSubscriptionPlanKey {
  if (status === "FREE") return "FREE";
  if (planKey && status === "ACTIVE") return planKey;
  if (planKey && status === "PAST_DUE" && gracePeriodEndAt) {
    const graceEnd =
      gracePeriodEndAt instanceof Date
        ? gracePeriodEndAt
        : new Date(gracePeriodEndAt);
    if (!Number.isNaN(graceEnd.getTime()) && now < graceEnd) return planKey;
  }
  return "FREE";
}

type FeatureEntitlement =
  | "ADVANCED_LOGISTICS"
  | "VENDOR_COORDINATION"
  | "DOCUMENTS"
  | "AUTOMATIONS"
  | "RISK_AND_CONTINGENCY"
  | "EVENT_DAY_OPERATIONS"
  | "E_SIGNATURES"
  | "ADVANCED_EXPORTS"
  | "VENDOR_PAYMENTS";

const capabilityEntitlement = new Map<CapabilityKey, FeatureEntitlement>([
  ["guest.import", "ADVANCED_EXPORTS"],
  ["guest.export", "ADVANCED_EXPORTS"],
  ["menu.export", "ADVANCED_EXPORTS"],
  ["budget.export", "ADVANCED_EXPORTS"],

  ["seating.write", "ADVANCED_LOGISTICS"],
  ["seating.assign", "ADVANCED_LOGISTICS"],
  ["seating.publish", "ADVANCED_LOGISTICS"],
  ["seating.generate_suggestion", "ADVANCED_LOGISTICS"],
  ["seating.export", "ADVANCED_LOGISTICS"],
  ["transport.write", "ADVANCED_LOGISTICS"],
  ["transport.assign", "ADVANCED_LOGISTICS"],
  ["transport.publish", "ADVANCED_LOGISTICS"],
  ["transport.export", "ADVANCED_LOGISTICS"],
  ["accommodation.write", "ADVANCED_LOGISTICS"],
  ["accommodation.assign", "ADVANCED_LOGISTICS"],
  ["accommodation.publish", "ADVANCED_LOGISTICS"],
  ["accommodation.export", "ADVANCED_LOGISTICS"],

  ["rfq.write", "VENDOR_COORDINATION"],
  ["rfq.send", "VENDOR_COORDINATION"],
  ["rfq.close", "VENDOR_COORDINATION"],
  ["offer.review", "VENDOR_COORDINATION"],
  ["offer.request_revision", "VENDOR_COORDINATION"],
  ["offer.accept", "VENDOR_COORDINATION"],
  ["offer.reject", "VENDOR_COORDINATION"],
  ["booking.write", "VENDOR_COORDINATION"],
  ["booking.transition", "VENDOR_COORDINATION"],
  ["contract.write", "VENDOR_COORDINATION"],
  ["contract.review", "VENDOR_COORDINATION"],
  ["contract.acknowledge", "VENDOR_COORDINATION"],
  ["contract.cancel", "VENDOR_COORDINATION"],
  ["contract.export", "VENDOR_COORDINATION"],

  ["document.write", "DOCUMENTS"],
  ["document.upload", "DOCUMENTS"],
  ["document.share", "DOCUMENTS"],
  ["document.delete", "DOCUMENTS"],
  ["document.manage_retention", "DOCUMENTS"],

  ["automation.write", "AUTOMATIONS"],
  ["automation.execute", "AUTOMATIONS"],
  ["automation.activate", "AUTOMATIONS"],
  ["automation.pause", "AUTOMATIONS"],
  ["automation.approve", "AUTOMATIONS"],
  ["automation.manage_templates", "AUTOMATIONS"],

  ["risk.write", "RISK_AND_CONTINGENCY"],
  ["risk.detect", "RISK_AND_CONTINGENCY"],
  ["risk.assess", "RISK_AND_CONTINGENCY"],
  ["risk.assign", "RISK_AND_CONTINGENCY"],
  ["risk.accept", "RISK_AND_CONTINGENCY"],
  ["risk.resolve", "RISK_AND_CONTINGENCY"],
  ["contingency.write", "RISK_AND_CONTINGENCY"],
  ["contingency.approve", "RISK_AND_CONTINGENCY"],
  ["contingency.activate", "RISK_AND_CONTINGENCY"],
  ["contingency.complete", "RISK_AND_CONTINGENCY"],

  ["wedding_day.write", "EVENT_DAY_OPERATIONS"],
  ["wedding_day.publish", "EVENT_DAY_OPERATIONS"],
  ["wedding_day.go_live", "EVENT_DAY_OPERATIONS"],
  ["wedding_day.transition", "EVENT_DAY_OPERATIONS"],
  ["wedding_day.manage_contacts", "EVENT_DAY_OPERATIONS"],
  ["incident.write", "EVENT_DAY_OPERATIONS"],
  ["incident.assign", "EVENT_DAY_OPERATIONS"],
  ["incident.resolve", "EVENT_DAY_OPERATIONS"],
  ["announcement.write", "EVENT_DAY_OPERATIONS"],
  ["announcement.publish", "EVENT_DAY_OPERATIONS"],
  ["check_in.write", "EVENT_DAY_OPERATIONS"],
  ["check_in.override", "EVENT_DAY_OPERATIONS"],
  ["check_in.manage_sessions", "EVENT_DAY_OPERATIONS"],
  ["check_in.manage_devices", "EVENT_DAY_OPERATIONS"],
  ["check_in.offline_sync", "EVENT_DAY_OPERATIONS"],
  ["guest_moment.upload", "EVENT_DAY_OPERATIONS"],
  ["guest_moment.moderate", "EVENT_DAY_OPERATIONS"],
  ["guest_moment.publish", "EVENT_DAY_OPERATIONS"],
  ["guest_moment.delete", "EVENT_DAY_OPERATIONS"],
  ["gallery.write", "EVENT_DAY_OPERATIONS"],
  ["gallery.publish", "EVENT_DAY_OPERATIONS"],

  ["signature.create", "E_SIGNATURES"],
  ["signature.send", "E_SIGNATURES"],
  ["signature.cancel", "E_SIGNATURES"],
  ["signature.sign", "E_SIGNATURES"],

  ["online_payment.create_checkout", "VENDOR_PAYMENTS"],
  ["online_payment.expire_checkout", "VENDOR_PAYMENTS"],
  ["online_payment.request_refund", "VENDOR_PAYMENTS"],
  ["online_payment.read_provider_details", "VENDOR_PAYMENTS"],
  ["online_payment.reconcile", "VENDOR_PAYMENTS"],
  ["online_payment.configure_provider", "VENDOR_PAYMENTS"],
]);

export function requiredPlanEntitlement(
  capability: CapabilityKey,
): FeatureEntitlement | null {
  return capabilityEntitlement.get(capability) ?? null;
}

export function capabilityAllowedByWorkspacePlan(
  capability: CapabilityKey,
  planKey: WorkspaceSubscriptionPlanKey,
): boolean {
  const entitlement = requiredPlanEntitlement(capability);
  if (!entitlement) return true;
  return workspacePlan(planKey).entitlements[entitlement] === true;
}

export function resolvePlanCapabilities(
  capabilities: readonly CapabilityKey[],
  planKey: WorkspaceSubscriptionPlanKey,
): CapabilityKey[] {
  return capabilities.filter((capability) =>
    capabilityAllowedByWorkspacePlan(capability, planKey),
  );
}

export function minimumPlanForCapability(
  capability: CapabilityKey,
): WorkspaceSubscriptionPlanKey | null {
  if (capabilityAllowedByWorkspacePlan(capability, "FREE")) return null;
  if (capabilityAllowedByWorkspacePlan(capability, "PLUS")) return "PLUS";
  if (capabilityAllowedByWorkspacePlan(capability, "PRO")) return "PRO";
  return null;
}
