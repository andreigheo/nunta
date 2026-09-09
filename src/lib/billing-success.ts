import type { WorkspaceBillingOverview } from "@weddingos/contracts";

type BillingSuccessOverview = Pick<
  WorkspaceBillingOverview,
  "plans" | "subscription" | "messageCredits"
>;

export type BillingSuccessNotice =
  | {
      kind: "subscription";
      title: string;
      description: string;
      primaryValue: string;
      primaryLabel: string;
      secondaryValue: string;
      secondaryLabel: string;
    }
  | {
      kind: "credits";
      title: string;
      description: string;
      primaryValue: string;
      primaryLabel: string;
      secondaryValue: string;
      secondaryLabel: string;
    };

export function subscriptionSuccessNotice(
  billing: BillingSuccessOverview,
): BillingSuccessNotice {
  const plan =
    billing.plans.find((candidate) => candidate.key === billing.subscription.plan)
      ?.name ?? billing.subscription.plan;
  const includedCredits = Number(
    billing.subscription.entitlements.MESSAGING_CREDITS ??
      billing.messageCredits.planAllowance,
  );

  return {
    kind: "subscription",
    title: `Planul ${plan} este activ`,
    description:
      "Plata a fost confirmată, iar funcțiile planului sunt disponibile pentru evenimentul tău.",
    primaryValue: includedCredits.toLocaleString("ro-RO"),
    primaryLabel: "credite de mesagerie / lună",
    secondaryValue: billing.subscription.currentPeriodEnd
      ? new Intl.DateTimeFormat("ro-RO", {
          day: "numeric",
          month: "long",
        }).format(new Date(billing.subscription.currentPeriodEnd))
      : "Activ acum",
    secondaryLabel: billing.subscription.currentPeriodEnd
      ? "următoarea reînnoire"
      : "abonament confirmat",
  };
}

export function creditSuccessNotice(
  credits: number,
  billing: BillingSuccessOverview,
): BillingSuccessNotice {
  return {
    kind: "credits",
    title: `${credits.toLocaleString("ro-RO")} de credite au fost adăugate`,
    description:
      "Plata a fost confirmată. Creditele cumpărate sunt disponibile imediat și nu expiră la reînnoirea planului.",
    primaryValue: billing.messageCredits.available.toLocaleString("ro-RO"),
    primaryLabel: "credite disponibile în total",
    secondaryValue: billing.messageCredits.purchased.toLocaleString("ro-RO"),
    secondaryLabel: "credite cumpărate separat",
  };
}

export function billingReturnUrl(
  origin: string,
  kind: "subscription" | "credits",
  transactionId: string,
) {
  const url = new URL("/settings", origin);
  url.searchParams.set("tab", "billing");
  url.searchParams.set(
    "checkout",
    kind === "subscription" ? "success" : "credits-success",
  );
  url.searchParams.set(
    kind === "subscription" ? "transaction" : "creditTransaction",
    transactionId,
  );
  return url.toString();
}
