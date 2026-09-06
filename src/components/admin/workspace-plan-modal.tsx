"use client";

import * as React from "react";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import {
  apiErrorMessage,
  type OperationResource,
  weddingOsApi,
} from "@/lib/api/client";

export function WorkspacePlanModal({
  target,
  onClose,
  onSaved,
}: {
  target: OperationResource;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const row = target as Record<string, unknown>;
  const subscription = row.subscription as Record<string, unknown> | null;
  const [plan, setPlan] = React.useState<"FREE" | "PLUS" | "PRO">(
    (subscription?.planKey as "FREE" | "PLUS" | "PRO") ?? "FREE",
  );
  const [reason, setReason] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 8 || !password || !code) {
      setError("Completează motivul, parola și codul MFA.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const challenge = await weddingOsApi.createAdminStepUp(
        "SUBSCRIPTION_OVERRIDE",
        password,
      );
      await weddingOsApi.verifyAdminStepUp(challenge.challengeId, code.trim());
      await weddingOsApi.setPlatformWorkspacePlan(
        target.id,
        plan,
        target.version,
        reason.trim(),
      );
      await onSaved();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Schimbă planul evenimentului"
      description={String(row.title ?? target.id)}
      size="sm"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Anulează
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Aplică planul
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm leading-5">
          Un abonament gestionat de furnizor nu poate fi rescris direct. API-ul
          oprește schimbarea dacă există o subscripție externă activă.
        </p>
        <Field label="Plan" required>
          <Select
            value={plan}
            onChange={(event) =>
              setPlan(event.target.value as "FREE" | "PLUS" | "PRO")
            }
          >
            <option value="FREE">Free</option>
            <option value="PLUS">Plus · 19 EUR</option>
            <option value="PRO">Pro · 39 EUR</option>
          </Select>
        </Field>
        <Field label="Motiv pentru audit" required>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Field label="Parola administrativă" required>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label="Cod MFA" required>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
