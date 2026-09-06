"use client";

import * as React from "react";
import { Button, Field, Input, Modal, Textarea } from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";

export function AdminActionModal({
  open,
  onClose,
  title,
  description,
  impact,
  purpose,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  impact: string;
  purpose?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 8) { setError("Motivul trebuie să aibă minimum 8 caractere."); return; }
    if (purpose && (!password || !code)) { setError("Parola și codul MFA sunt obligatorii pentru această acțiune."); return; }
    setBusy(true); setError(null);
    try {
      if (purpose) {
        const challenge = await weddingOsApi.createAdminStepUp(purpose, password);
        await weddingOsApi.verifyAdminStepUp(challenge.challengeId, code.trim());
      }
      await onConfirm(reason.trim());
      onClose();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally { setBusy(false); }
  };

  return <Modal open={open} onClose={onClose} title={title} description={description} size="sm" footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button><Button variant={destructive ? "destructive" : "primary"} loading={busy} onClick={() => void submit()}>{confirmLabel}</Button></>}>
    <div className="space-y-4">
      <div className={`rounded-lg border p-3 text-sm leading-5 ${destructive ? "border-danger/25 bg-danger-soft text-ink" : "border-line bg-subtle text-muted"}`}><strong className="block text-ink">Impact</strong>{impact}</div>
      <Field label="Motiv pentru audit" required hint="Va fi păstrat în jurnalul administrativ."><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Descrie motivul și contextul operațional…" /></Field>
      {purpose ? <><Field label="Parola contului administrativ" required><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field><Field label="Cod MFA sau recovery code" required><Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /></Field></> : null}
      {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
    </div>
  </Modal>;
}
