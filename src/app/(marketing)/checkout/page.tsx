import type { Metadata } from "next";
import { PaddleCheckout } from "@/components/marketing/paddle-checkout";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Checkout securizat",
  description: "Finalizează abonamentul Sarbato în checkout-ul securizat Paddle.",
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const rawTransactionId = Array.isArray(query._ptxn)
    ? query._ptxn[0]
    : query._ptxn;
  const transactionId =
    typeof rawTransactionId === "string" &&
    /^txn_[A-Za-z0-9]+$/.test(rawTransactionId)
      ? rawTransactionId
      : null;

  return (
    <Section className="bg-[radial-gradient(circle_at_75%_10%,rgba(191,119,75,0.12),transparent_34%),linear-gradient(180deg,var(--color-canvas),var(--color-subtle))]">
      <PaddleCheckout transactionId={transactionId} />
    </Section>
  );
}
