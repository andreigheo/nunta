"use client";

import * as React from "react";
import {
  AlertTriangle,
  BadgeCheck,
  MessageSquareReply,
  Star,
} from "lucide-react";
import { VendorPage } from "@/components/vendor/vendor-page";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  weddingOsApi,
  type OperationResource,
} from "@/lib/api/client";
import { useVendorOrganization } from "@/lib/api/vendor-organization";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";

export default function VendorReviewsPage() {
  const context = useVendorOrganization();
  const { organizationId, organization, loading, can } = context;
  const { toast } = useToast();
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [summary, setSummary] = React.useState<Record<string, unknown>>({});
  const [disputes, setDisputes] = React.useState<OperationResource[]>([]);
  const [selected, setSelected] = React.useState<OperationResource | null>(
    null,
  );
  const [reply, setReply] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [disputedReview, setDisputedReview] =
    React.useState<OperationResource | null>(null);
  const [disputeReason, setDisputeReason] = React.useState("");
  const [disputeStatement, setDisputeStatement] = React.useState("");
  const load = React.useCallback(async () => {
    if (!organizationId || loading || !organization) return;
    if (!can("vendor.review.read")) {
      setItems([]);
      setSummary({});
      setDisputes([]);
      return;
    }
    try {
      const [result, disputeResult] = await Promise.all([
        weddingOsApi.vendorReviews(organizationId),
        weddingOsApi.vendorReviewDisputes(organizationId),
      ]);
      setItems(result.items);
      setSummary(result.summary);
      setDisputes(disputeResult.items);
    } catch (error) {
      toast({
        title: "Recenziile nu au putut fi încărcate",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [organizationId, organization, loading, can, toast]);
  useDeferredLoad(load);
  const open = (review: OperationResource) => {
    setSelected(review);
    setReply(
      review.reply && typeof review.reply === "object"
        ? String((review.reply as Record<string, unknown>).body ?? "")
        : "",
    );
  };
  const save = async (publish: boolean) => {
    if (!selected || !context.organizationId) return;
    setSaving(true);
    try {
      const existing =
        selected.reply && typeof selected.reply === "object"
          ? (selected.reply as OperationResource)
          : null;
      const row = await weddingOsApi.saveVendorReviewReply(
        context.organizationId,
        selected.id,
        reply,
        existing?.version,
      );
      if (publish)
        await weddingOsApi.publishVendorReviewReply(
          context.organizationId,
          selected.id,
          row.version,
        );
      setSelected(null);
      await load();
      toast({
        title: publish ? "Răspuns publicat" : "Ciornă salvată",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Răspunsul nu a fost salvat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };
  const dispute = async () => {
    if (!disputedReview || !context.organizationId) return;
    setSaving(true);
    try {
      await weddingOsApi.createVendorReviewDispute(
        context.organizationId,
        disputedReview.id,
        disputedReview.version,
        { reason: disputeReason, statementPrivate: disputeStatement },
      );
      setDisputedReview(null);
      setDisputeReason("");
      setDisputeStatement("");
      await load();
      toast({
        title: "Contestație deschisă",
        description: "Declarația privată a intrat în moderarea Platform Trust.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Contestația nu a fost deschisă",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <VendorPage
      title="Recenzii verificate"
      description="Feedback real din bookinguri finalizate, răspuns public și contestații separate."
      organizationId={context.organizationId}
      organizations={context.organizations}
      onOrganizationChange={context.setOrganizationId}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Rating"
          value={
            summary.overallAverageScaled
              ? (Number(summary.overallAverageScaled) / 100).toFixed(1)
              : "—"
          }
        />
        <Metric
          label="Publicate"
          value={Number(summary.publishedReviewCount ?? 0)}
        />
        <Metric
          label="Verificate"
          value={Number(summary.verifiedReviewCount ?? 0)}
        />
      </div>
      {!items.length ? (
        <EmptyState
          icon={BadgeCheck}
          title="Nicio evaluare încă"
          description="Recenziile vor apărea după ce un cuplu publică feedback pentru un booking finalizat."
        />
      ) : (
        <div className="space-y-3">
          {items.map((review) => {
            const versions = Array.isArray(review.versions)
              ? (review.versions as OperationResource[])
              : [];
            const content =
              versions.find((item) => item.id === review.publishedVersionId) ??
              versions.at(-1);
            const hasDispute = disputes.some(
              (item) => item.reviewId === review.id,
            );
            return (
              <Card key={review.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">
                        {String(content?.title ?? review.title)}
                      </p>
                      <p className="mt-1 text-xs text-success">
                        <BadgeCheck className="mr-1 inline size-3.5" />
                        Booking verificat
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`size-4 text-accent ${star <= Number(review.overallRating) ? "fill-current" : ""}`}
                          />
                        ))}
                      </span>
                      <Badge
                        variant={
                          review.status === "PUBLISHED" ? "success" : "warning"
                        }
                      >
                        {String(review.status).toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {String(content?.body ?? "")}
                  </p>
                  {review.reply && typeof review.reply === "object" ? (
                    <div className="mt-3 rounded-lg bg-subtle p-3 text-sm text-muted">
                      Răspuns:{" "}
                      {String((review.reply as Record<string, unknown>).body)}
                    </div>
                  ) : null}
                  {context.can("vendor.review.reply") ||
                  context.can("vendor.review.dispute") ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {context.can("vendor.review.reply") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => open(review)}
                        >
                          <MessageSquareReply className="size-4" />
                          {review.reply ? "Editează răspunsul" : "Răspunde"}
                        </Button>
                      ) : null}
                      {context.can("vendor.review.dispute") ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={hasDispute}
                          onClick={() => {
                            setDisputedReview(review);
                            setDisputeReason("");
                            setDisputeStatement("");
                          }}
                        >
                          <AlertTriangle className="size-4" />
                          {hasDispute ? "Contestație deschisă" : "Contestă"}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Modal
        open={Boolean(selected)}
        onClose={() => !saving && setSelected(null)}
        title="Răspuns public"
        description="Răspunsul este legat de versiunea publicată a recenziei."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Renunță
            </Button>
            <Button
              variant="outline"
              disabled={saving || reply.trim().length < 2}
              onClick={() => void save(false)}
            >
              Salvează ciorna
            </Button>
            <Button
              disabled={saving || reply.trim().length < 2}
              onClick={() => void save(true)}
            >
              Publică
            </Button>
          </>
        }
      >
        <Field label="Răspuns">
          <Textarea
            rows={5}
            maxLength={2000}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          />
        </Field>
      </Modal>
      <Modal
        open={Boolean(disputedReview)}
        onClose={() => !saving && setDisputedReview(null)}
        title="Contestă recenzia"
        description="Contestația nu ascunde automat recenzia; Platform Trust decide după verificare."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setDisputedReview(null)}
            >
              Renunță
            </Button>
            <Button
              disabled={
                saving ||
                disputeReason.trim().length < 2 ||
                disputeStatement.trim().length < 10
              }
              onClick={() => void dispute()}
            >
              <AlertTriangle className="size-4" />
              Deschide contestația
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Motiv" required>
            <Textarea
              rows={2}
              maxLength={1000}
              value={disputeReason}
              onChange={(event) => setDisputeReason(event.target.value)}
            />
          </Field>
          <Field
            label="Declarație privată pentru moderator"
            required
            hint={`${disputeStatement.length}/4000`}
          >
            <Textarea
              rows={6}
              maxLength={4000}
              value={disputeStatement}
              onChange={(event) => setDisputeStatement(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </VendorPage>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      </CardContent>
    </Card>
  );
}
