"use client";

import * as React from "react";
import { CheckCircle2, Download, FileSignature, Paperclip, PenLine, Send, Upload, XCircle } from "lucide-react";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import { Badge, Button, Card, CardContent, Drawer, EmptyState, Field, Input, Modal, PageHeader, Select, useToast } from "@/components/ui";

export default function ContractsPage() {
  const { currentWorkspace, demoMode, user } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [selected, setSelected] = React.useState<OperationResource | null>(null);
  const [typedName, setTypedName] = React.useState("");
  const [envelopes, setEnvelopes] = React.useState<OperationResource[]>([]);
  const [signatureOpen, setSignatureOpen] = React.useState(false);
  const [candidates, setCandidates] = React.useState<{ wedding: Array<{ membershipId: string; name: string; email: string }>; vendor: Array<{ membershipId: string; name: string; email: string }> }>({ wedding: [], vendor: [] });
  const [weddingSigner, setWeddingSigner] = React.useState("");
  const [vendorSigner, setVendorSigner] = React.useState("");
  const [contractDocuments, setContractDocuments] = React.useState<OperationResource[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = React.useState(false);
  const attachmentInput = React.useRef<HTMLInputElement>(null);
  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return setItems([]);
    try { const [contracts, signatureRows] = await Promise.all([weddingOsApi.commercialContracts(currentWorkspace.id), weddingOsApi.signatureEnvelopes(currentWorkspace.id)]); setItems(contracts.items); setEnvelopes(signatureRows); }
    catch (error) { toast({ title: "Contractele nu au putut fi încărcate", description: apiErrorMessage(error), variant: "error" }); }
  }, [currentWorkspace, demoMode, toast]);
  useDeferredLoad(load);
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (user)
        setTypedName(`${user.user.firstName} ${user.user.lastName}`.trim());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user]);
  React.useEffect(() => {
    if (!currentWorkspace || !selected || demoMode) return;
    void weddingOsApi.contractDocuments(currentWorkspace.id, selected.id).then((result) => setContractDocuments(result.items)).catch(() => setContractDocuments([]));
  }, [currentWorkspace, demoMode, selected]);

  const transition = async (contract: OperationResource, action: string) => {
    if (!currentWorkspace) return;
    try { const updated = await weddingOsApi.transitionContract(currentWorkspace.id, contract.id, contract.version, action); setSelected(updated); await load(); toast({ title: "Contract actualizat", variant: "success" }); }
    catch (error) { toast({ title: "Contractul nu a fost actualizat", description: apiErrorMessage(error), variant: "error" }); }
  };
  const acknowledge = async () => {
    if (!currentWorkspace || !selected) return;
    const version = record(selected.currentVersion);
    try { const updated = await weddingOsApi.acknowledgeContract(currentWorkspace.id, selected.id, selected.version, { typedName, statementVersion: "weddingos-contract-ack-v1", contentHash: String(version.contentHash) }); setSelected(updated); await load(); toast({ title: "Confirmare înregistrată", description: "Aceasta este o confirmare operațională Sarbato, nu o semnătură electronică calificată.", variant: "success" }); }
    catch (error) { toast({ title: "Confirmarea nu a fost salvată", description: apiErrorMessage(error), variant: "error" }); }
  };
  const exportHtml = async () => {
    if (!currentWorkspace || !selected) return;
    const version = record(selected.currentVersion);
    try {
      const queued = await weddingOsApi.exportContract(currentWorkspace.id, selected.id, { format: "html", contractVersionId: version.id });
      toast({ title: "Export pus în coadă", description: "Artefactul HTML este generat de worker și va fi descărcat când este pregătit.", variant: "info" });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const job = await weddingOsApi.job(queued.job.id);
        if (job.status === "completed") { const blob = await weddingOsApi.downloadJobArtifact(job.id); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `contract-${selected.id}.html`; anchor.click(); URL.revokeObjectURL(url); return; }
        if (job.status === "failed" || job.status === "dead_letter") throw new Error("Exportul a eșuat în worker");
      }
      throw new Error("Exportul este încă în procesare. Verifică din nou jobul.");
    } catch (error) { toast({ title: "Exportul nu a fost finalizat", description: apiErrorMessage(error), variant: "error" }); }
  };
  const openSignature = async () => {
    if (!currentWorkspace || !selected) return;
    const contractVersionId = String(record(selected.currentVersion).id ?? "");
    try { const rows = await weddingOsApi.signatureCandidates(currentWorkspace.id, contractVersionId); setCandidates(rows); setWeddingSigner(rows.wedding[0]?.membershipId ?? ""); setVendorSigner(rows.vendor[0]?.membershipId ?? ""); setSignatureOpen(true); }
    catch (error) { toast({ title: "Semnatarii nu au putut fi încărcați", description: apiErrorMessage(error), variant: "error" }); }
  };
  const createSignature = async () => {
    if (!currentWorkspace || !selected || !weddingSigner || !vendorSigner) return;
    try { const envelope = await weddingOsApi.createSignatureEnvelope(currentWorkspace.id, { contractVersionId: String(record(selected.currentVersion).id), weddingSignerMembershipId: weddingSigner, vendorSignerMembershipId: vendorSigner }); const sent = await weddingOsApi.sendSignatureEnvelope(currentWorkspace.id, envelope.id, envelope.version); setSignatureOpen(false); await load(); toast({ title: "Contract trimis la semnare", description: `Plicul ${sent.id.slice(0, 8)} este legat de PDF-ul materializat și de hash-ul versiunii.`, variant: "success" }); }
    catch (error) { toast({ title: "Plicul de semnătură nu a fost creat", description: apiErrorMessage(error), variant: "error" }); }
  };
  const sign = async (envelopeId: string) => {
    if (!currentWorkspace) return;
    try { const session = await weddingOsApi.signatureSigningSession(currentWorkspace.id, envelopeId); window.location.assign(session.url); }
    catch (error) { toast({ title: "Sesiunea de semnare nu este disponibilă", description: apiErrorMessage(error), variant: "error" }); }
  };
  const uploadAttachment = async (file: File) => {
    if (!currentWorkspace || !selected) return;
    setUploadingAttachment(true);
    try {
      const bytes = await file.arrayBuffer();
      const checksum = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
      const session = await weddingOsApi.createUploadSession(currentWorkspace.id, { purpose: "CONTRACT_ATTACHMENT", originalFileName: file.name, contentType: "application/pdf", sizeBytes: file.size, checksumSha256: checksum });
      await weddingOsApi.putSignedUpload(session.upload.url, file, session.upload.headers);
      await weddingOsApi.completeUploadSession(session.id, checksum);
      await weddingOsApi.createContractDocument(currentWorkspace.id, selected.id, { uploadSessionId: session.id, title: file.name.replace(/\.pdf$/i, ""), documentType: "CONTRACT_ATTACHMENT", classification: "CONTRACTUAL" });
      const result = await weddingOsApi.contractDocuments(currentWorkspace.id, selected.id); setContractDocuments(result.items);
      toast({ title: "Atașament trimis la verificare", description: "Download-ul se activează numai după scanarea antivirus.", variant: "success" });
    } catch (error) { toast({ title: "Atașamentul nu a fost încărcat", description: apiErrorMessage(error), variant: "error" }); }
    finally { setUploadingAttachment(false); if (attachmentInput.current) attachmentInput.current.value = ""; }
  };
  const downloadDocument = async (documentId: string) => {
    if (!currentWorkspace) return;
    try { const target = await weddingOsApi.createDocumentDownload(currentWorkspace.id, documentId); window.location.assign(target.url); }
    catch (error) { toast({ title: "Documentul nu poate fi descărcat", description: apiErrorMessage(error), variant: "error" }); }
  };

  return <div className="mx-auto max-w-7xl space-y-4"><PageHeader title="Contracte" description="Documente operaționale versionate și confirmări distincte pentru ambele părți." />{items.length === 0 ? <EmptyState icon={FileSignature} title="Niciun contract" description="Un contract inițial este creat atomic când o ofertă este acceptată." /> : <div className="grid gap-3 md:grid-cols-2">{items.map((item) => <Card key={item.id} interactive onClick={() => setSelected(item)}><CardContent className="p-4"><div className="flex justify-between gap-3"><p className="font-semibold text-ink">Contract booking {String(item.bookingId).slice(0, 8)}</p><Badge variant={item.status === "ACKNOWLEDGED" ? "success" : item.status === "CANCELLED" ? "danger" : "brand"} dot>{label(String(item.status))}</Badge></div><p className="mt-2 text-sm text-muted">Versiunea documentului: {String(item.currentVersionNumber)}</p><p className="text-xs text-faint">Confirmări: {Array.isArray(item.acknowledgements) ? item.acknowledgements.length : 0}/2</p></CardContent></Card>)}</div>}
    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title="Contract operațional" description={selected ? `${label(String(selected.status))} · versiunea ${selected.version}` : undefined} width="xl">{selected ? <div className="space-y-4 p-5"><p className="rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">{String(selected.disclaimer)}</p><pre className="max-h-[420px] overflow-auto rounded-lg bg-subtle p-4 text-xs text-muted">{JSON.stringify(record(selected.currentVersion).document ?? {}, null, 2)}</pre><div className="flex flex-wrap gap-2">{selected.status === "DRAFT" ? <Button onClick={() => void transition(selected, "SUBMIT_FOR_REVIEW")}><Send className="size-4" />Trimite la verificare</Button> : null}{["IN_REVIEW", "CHANGES_REQUESTED"].includes(String(selected.status)) ? <Button onClick={() => void transition(selected, "MARK_READY")}><CheckCircle2 className="size-4" />Pregătit pentru confirmare</Button> : null}{!["CANCELLED", "ACKNOWLEDGED", "ARCHIVED"].includes(String(selected.status)) ? <Button variant="destructive-outline" onClick={() => void transition(selected, "CANCEL")}><XCircle className="size-4" />Anulează</Button> : null}<Button variant="outline" onClick={() => void exportHtml()}><Download className="size-4" />Export HTML</Button><Button variant="outline" disabled={uploadingAttachment} onClick={() => attachmentInput.current?.click()}><Upload className="size-4" />Atașament PDF</Button><input ref={attachmentInput} className="hidden" type="file" accept="application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }} />{!["CANCELLED", "ARCHIVED"].includes(String(selected.status)) && !envelopes.some((envelope) => envelope.contractId === selected.id && !["DECLINED", "EXPIRED", "CANCELLED", "FAILED"].includes(String(envelope.status))) ? <Button variant="outline" onClick={() => void openSignature()}><FileSignature className="size-4" />Semnătură electronică</Button> : null}</div>{contractDocuments.length ? <Card><CardContent className="space-y-2 p-4"><p className="font-medium text-ink">Atașamente și materializări</p>{contractDocuments.map((document) => <div key={document.id} className="flex items-center justify-between gap-2 rounded-lg border border-subtle p-2 text-sm"><span className="inline-flex items-center gap-2"><Paperclip className="size-4" />{String(document.title)}</span><Button size="sm" variant="ghost" disabled={document.status !== "AVAILABLE"} onClick={() => void downloadDocument(document.id)}>Descarcă</Button></div>)}</CardContent></Card> : null}{envelopes.filter((envelope) => envelope.contractId === selected.id).map((envelope) => <Card key={envelope.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium text-ink">Plic electronic {envelope.id.slice(0, 8)}</p><div className="mt-1 flex gap-2"><Badge variant={envelope.status === "COMPLETED" ? "success" : envelope.status === "DECLINED" ? "danger" : "warning"}>{label(String(envelope.status))}</Badge><Badge variant="outline">{label(String(envelope.signatureLevel))}</Badge></div></div><div className="flex gap-2">{["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(String(envelope.status)) ? <Button onClick={() => void sign(envelope.id)}><PenLine className="size-4" />Semnează</Button> : null}{["READY", "SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(String(envelope.status)) ? <Button variant="ghost" onClick={() => void weddingOsApi.cancelSignatureEnvelope(currentWorkspace!.id, envelope.id, envelope.version, "Anulat de organizator").then(load).catch((error) => toast({ title: "Plicul nu a fost anulat", description: apiErrorMessage(error), variant: "error" }))}>Anulează</Button> : null}{envelope.status === "COMPLETED" ? <Button variant="outline" onClick={() => void weddingOsApi.signatureEvidence(currentWorkspace!.id, envelope.id).then((evidence) => toast({ title: "Evidence verificată", description: `Hash ${String(evidence.documentHash).slice(0, 16)}…`, variant: "success" })).catch((error) => toast({ title: "Evidence indisponibilă", description: apiErrorMessage(error), variant: "error" }))}>Evidence</Button> : null}</div></CardContent></Card>)}{selected.status === "READY_FOR_ACKNOWLEDGEMENT" ? <Card><CardContent className="p-4"><Field label="Numele pentru confirmare"><Input value={typedName} onChange={(event) => setTypedName(event.target.value)} /></Field><Button className="mt-3" disabled={typedName.trim().length < 2} onClick={() => void acknowledge()}>Confirmă în Sarbato</Button><p className="mt-2 text-xs text-muted">Confirmarea operațională rămâne distinctă de fluxul de semnătură electronică.</p></CardContent></Card> : null}</div> : null}</Drawer>
    <Modal open={signatureOpen} onClose={() => setSignatureOpen(false)} title="Trimite contractul la semnare" description="Sarbato materializează un PDF imutabil și leagă plicul de hash-ul versiunii." footer={<><Button variant="ghost" onClick={() => setSignatureOpen(false)}>Renunță</Button><Button disabled={!weddingSigner || !vendorSigner} onClick={() => void createSignature()}>Creează și trimite</Button></>}><div className="space-y-3"><Field label="Semnatarul cuplului"><Select value={weddingSigner} onChange={(event) => setWeddingSigner(event.target.value)}><option value="">Selectează</option>{candidates.wedding.map((candidate) => <option key={candidate.membershipId} value={candidate.membershipId}>{candidate.name} · {candidate.email}</option>)}</Select></Field><Field label="Semnatarul furnizorului"><Select value={vendorSigner} onChange={(event) => setVendorSigner(event.target.value)}><option value="">Selectează</option>{candidates.vendor.map((candidate) => <option key={candidate.membershipId} value={candidate.membershipId}>{candidate.name} · {candidate.email}</option>)}</Select></Field></div></Modal>
  </div>;
}
function label(value: string) { return value.toLowerCase().replaceAll("_", " "); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
