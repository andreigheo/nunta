"use client";

import * as React from "react";
import { Download, FileText, Folder, FolderPlus, MoreHorizontal, Search, Share2, ShieldCheck, Trash2, Upload } from "lucide-react";
import type { TeamMember } from "@weddingos/contracts";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import { formatRelativeTime } from "@/lib/utils";
import { Badge, Button, Card, CardContent, ConfirmDialog, Dropdown, DropdownContent, DropdownItem, DropdownTrigger, EmptyState, Field, Input, Modal, PageHeader, Select, Table, TBody, TD, TH, THead, TR, useToast } from "@/components/ui";

export default function DocumentsPage() {
  const { currentWorkspace, bootstrap, demoMode, user } = useWorkspace();
  const { toast } = useToast();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [folderFilter, setFolderFilter] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [docs, setDocs] = React.useState<OperationResource[]>([]);
  const [folders, setFolders] = React.useState<OperationResource[]>([]);
  const [folderOpen, setFolderOpen] = React.useState(false);
  const [folderName, setFolderName] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [teamMembers, setTeamMembers] = React.useState<TeamMember[]>([]);
  const [shareDocument, setShareDocument] = React.useState<OperationResource | null>(null);
  const [shareDetails, setShareDetails] = React.useState<(OperationResource & { grants?: OperationResource[] }) | null>(null);
  const [shareMemberId, setShareMemberId] = React.useState("");
  const [sharePermission, setSharePermission] = React.useState<"READ" | "DOWNLOAD" | "MANAGE" | "SHARE">("DOWNLOAD");
  const [shareExpiresAt, setShareExpiresAt] = React.useState("");
  const [sharing, setSharing] = React.useState(false);
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("document.write");
  const canUpload = capabilities.includes("document.upload");
  const canDownload = capabilities.includes("document.download");
  const canShare = capabilities.includes("document.share");
  const canDelete = capabilities.includes("document.delete");

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) { setDocs([]); setFolders([]); return; }
    try {
      const [documents, folderRows, team] = await Promise.all([weddingOsApi.documents(currentWorkspace.id, query.trim() || undefined), weddingOsApi.documentFolders(currentWorkspace.id), canShare ? weddingOsApi.team(currentWorkspace.id) : Promise.resolve(null)]);
      setDocs(documents.items); setFolders(folderRows); setTeamMembers(team?.members ?? []);
    } catch (error) { toast({ title: "Documentele nu au putut fi încărcate", description: apiErrorMessage(error), variant: "error" }); }
  }, [canShare, currentWorkspace, demoMode, query, toast]);
  useDeferredLoad(load);

  const uploadFile = async (file: File) => {
    if (!currentWorkspace || !canUpload) return;
    if (demoMode) { toast({ title: "Încărcarea este izolată în demo", description: "Nicio mutație API nu a fost trimisă.", variant: "info" }); return; }
    setUploading(true);
    try {
      const bytes = await file.arrayBuffer();
      const checksum = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
      const contentType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
      if (!contentType) throw new Error("Tipul fișierului nu poate fi identificat în siguranță.");
      const session = await weddingOsApi.createUploadSession(currentWorkspace.id, { purpose: "GENERAL_COMMERCIAL_DOCUMENT", originalFileName: file.name, contentType, sizeBytes: file.size, checksumSha256: checksum });
      await weddingOsApi.putSignedUpload(session.upload.url, file, session.upload.headers);
      await weddingOsApi.completeUploadSession(session.id, checksum);
      await weddingOsApi.createVaultDocument(currentWorkspace.id, { uploadSessionId: session.id, title: file.name.replace(/\.[^.]+$/, ""), description: null, folderId: folderFilter, documentType: "OTHER", classification: "WEDDING_PRIVATE" });
      await load();
      toast({ title: "Document trimis la verificare", description: "Fișierul devine disponibil numai după validarea tipului, checksum-ului și scanarea antivirus.", variant: "success" });
      window.setTimeout(() => void load(), 1800);
    } catch (error) { toast({ title: "Documentul nu a fost încărcat", description: error instanceof Error ? error.message : apiErrorMessage(error), variant: "error" }); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  };

  const createFolder = async () => {
    if (!currentWorkspace || !canWrite || !folderName.trim()) return;
    if (demoMode) { setFolderOpen(false); toast({ title: "Folder demo nesalvat", variant: "info" }); return; }
    try { await weddingOsApi.createDocumentFolder(currentWorkspace.id, { name: folderName.trim(), parentFolderId: null, classification: "GENERAL" }); setFolderName(""); setFolderOpen(false); await load(); toast({ title: "Folder creat", variant: "success" }); }
    catch (error) { toast({ title: "Folderul nu a fost creat", description: apiErrorMessage(error), variant: "error" }); }
  };

  const download = async (document: OperationResource) => {
    if (!currentWorkspace || !canDownload) return;
    try { const target = await weddingOsApi.createDocumentDownload(currentWorkspace.id, document.id); window.location.assign(target.url); }
    catch (error) { toast({ title: "Documentul nu poate fi descărcat", description: apiErrorMessage(error), variant: "error" }); }
  };

  const openShare = async (document: OperationResource) => {
    if (!currentWorkspace || !canShare) return;
    setShareDocument(document);
    setShareMemberId((current) => current || teamMembers.find((member) => member.userId !== user?.user.id)?.userId || "");
    try {
      setShareDetails(await weddingOsApi.document(currentWorkspace.id, document.id));
    } catch (error) {
      setShareDocument(null);
      toast({ title: "Accesul documentului nu a putut fi încărcat", description: apiErrorMessage(error), variant: "error" });
    }
  };

  const share = async () => {
    if (!currentWorkspace || !shareDocument || !shareMemberId || !canShare) return;
    setSharing(true);
    try {
      await weddingOsApi.createDocumentGrant(currentWorkspace.id, shareDocument.id, {
        granteeType: "USER",
        granteeId: shareMemberId,
        permission: sharePermission,
        expiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : null,
      });
      setShareDetails(await weddingOsApi.document(currentWorkspace.id, shareDocument.id));
      toast({ title: "Acces acordat", description: "Membrul selectat poate folosi documentul conform permisiunii alese.", variant: "success" });
    } catch (error) {
      toast({ title: "Documentul nu a fost partajat", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setSharing(false);
    }
  };

  const revokeShare = async (grantId: string) => {
    if (!currentWorkspace || !shareDocument || !canShare) return;
    setSharing(true);
    try {
      await weddingOsApi.revokeDocumentGrant(currentWorkspace.id, shareDocument.id, grantId);
      setShareDetails(await weddingOsApi.document(currentWorkspace.id, shareDocument.id));
      toast({ title: "Acces revocat", variant: "success" });
    } catch (error) {
      toast({ title: "Accesul nu a fost revocat", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setSharing(false);
    }
  };

  const filtered = folderFilter ? docs.filter((item) => item.folderId === folderFilter) : docs;
  const folderNameFor = (id: unknown) => folders.find((item) => item.id === id)?.name ?? "Fără folder";
  return <div className="mx-auto max-w-7xl space-y-5">
    <PageHeader title="Documente" description="Vault privat, versionat și scanat înainte de download." actions={<><Button variant="outline" size="sm" disabled={!canWrite || demoMode} onClick={() => setFolderOpen(true)}><FolderPlus className="size-3.5" /><span className="hidden sm:inline">Folder nou</span></Button><Button size="sm" disabled={!canUpload || demoMode || uploading} onClick={() => fileInput.current?.click()}><Upload className="size-4" />{uploading ? "Se încarcă…" : "Încarcă"}</Button><input ref={fileInput} className="hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} /></>} />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"><Card interactive className={!folderFilter ? "border-brand" : undefined} onClick={() => setFolderFilter(null)}><CardContent className="flex items-center gap-3 p-4"><span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"><Folder className="size-5" /></span><div><p className="text-sm font-semibold text-ink">Toate</p><p className="text-xs text-faint">{docs.length} documente</p></div></CardContent></Card>{folders.map((folder) => <Card key={folder.id} interactive className={folderFilter === folder.id ? "border-brand" : undefined} onClick={() => setFolderFilter(folderFilter === folder.id ? null : folder.id)}><CardContent className="flex items-center gap-3 p-4"><span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"><Folder className="size-5" /></span><div><p className="text-sm font-semibold text-ink">{String(folder.name)}</p><p className="text-xs text-faint">{docs.filter((item) => item.folderId === folder.id).length} fișiere</p></div></CardContent></Card>)}</div>
    <Input icon={<Search className="size-4" />} placeholder="Caută documente…" value={query} onChange={(event) => setQuery(event.target.value)} className="max-w-sm" aria-label="Caută documente" />
    {filtered.length === 0 ? <EmptyState icon={FileText} title="Niciun document găsit" description={folderFilter || query ? "Ajustează filtrul sau căutarea." : "Încarcă primul document; acesta va fi verificat înainte de a deveni disponibil."} action={canUpload && !demoMode ? { label: "Încarcă document", onClick: () => fileInput.current?.click(), icon: <Upload className="size-4" /> } : undefined} /> : <Table minWidth="760px"><THead><TR><TH>Document</TH><TH>Folder</TH><TH>Clasificare</TH><TH>Stare</TH><TH>Actualizat</TH><TH className="w-12" /></TR></THead><TBody>{filtered.map((document) => <TR key={document.id}><TD><span className="flex items-center gap-2.5 font-medium"><FileText className="size-4 shrink-0 text-faint" />{String(document.title)}</span></TD><TD><Badge variant="neutral">{String(folderNameFor(document.folderId))}</Badge></TD><TD className="text-muted">{label(String(document.classification))}</TD><TD><Badge variant={document.status === "AVAILABLE" ? "success" : document.status === "QUARANTINED" ? "danger" : "warning"} dot>{label(String(document.status))}</Badge></TD><TD className="text-faint">{formatRelativeTime(String(document.updatedAt))}</TD><TD><Dropdown><DropdownTrigger><button aria-label="Acțiuni document" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-subtle hover:text-ink"><MoreHorizontal className="size-4" /></button></DropdownTrigger><DropdownContent widthClass="w-52"><DropdownItem icon={<Download />} disabled={!canDownload || document.status !== "AVAILABLE"} onSelect={() => void download(document)}>Descarcă securizat</DropdownItem><DropdownItem icon={<ShieldCheck />} onSelect={() => toast({ title: "Stare verificare", description: document.status === "AVAILABLE" ? "Document curat și disponibil." : `Stare curentă: ${label(String(document.status))}.`, variant: "info" })}>Detalii securitate</DropdownItem><DropdownItem icon={<Share2 />} disabled={!canShare || document.status !== "AVAILABLE"} onSelect={() => void openShare(document)}>Partajează cu echipa</DropdownItem><DropdownItem icon={<Trash2 />} disabled={!canDelete} destructive onSelect={() => setDeleteId(document.id)}>Șterge</DropdownItem></DropdownContent></Dropdown></TD></TR>)}</TBody></Table>}
    <Modal open={folderOpen} onClose={() => setFolderOpen(false)} title="Folder nou" footer={<><Button variant="ghost" onClick={() => setFolderOpen(false)}>Renunță</Button><Button disabled={!folderName.trim()} onClick={() => void createFolder()}>Creează</Button></>}><Field label="Denumire"><Input value={folderName} onChange={(event) => setFolderName(event.target.value)} /></Field></Modal>
    <Modal open={Boolean(shareDocument)} onClose={() => { if (!sharing) { setShareDocument(null); setShareDetails(null); } }} title={shareDocument ? `Partajează „${String(shareDocument.title)}”` : "Partajează documentul"} description="Accesul este nominal, auditat și poate fi revocat oricând." size="lg"><div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Membru al echipei"><Select value={shareMemberId} onChange={(event) => setShareMemberId(event.target.value)}><option value="">Selectează persoana</option>{teamMembers.filter((member) => member.userId !== user?.user.id && member.status === "active").map((member) => <option key={member.id} value={member.userId}>{member.name || member.email} · {member.email}</option>)}</Select></Field><Field label="Permisiune"><Select value={sharePermission} onChange={(event) => setSharePermission(event.target.value as typeof sharePermission)}><option value="READ">Vizualizare</option><option value="DOWNLOAD">Vizualizare și descărcare</option><option value="MANAGE">Administrare document</option><option value="SHARE">Poate partaja mai departe</option></Select></Field><Field label="Expiră la (opțional)" className="sm:col-span-2"><Input type="datetime-local" value={shareExpiresAt} onChange={(event) => setShareExpiresAt(event.target.value)} /></Field></div><div className="flex justify-end"><Button loading={sharing} disabled={sharing || !shareMemberId} onClick={() => void share()}><Share2 className="size-4" />Acordă acces</Button></div><div className="border-t border-line pt-4"><p className="text-sm font-semibold text-ink">Accesuri active</p><div className="mt-3 space-y-2">{(shareDetails?.grants ?? []).length === 0 ? <p className="text-sm text-muted">Documentul nu este partajat cu alte persoane.</p> : (shareDetails?.grants ?? []).map((grant) => { const member = teamMembers.find((item) => item.userId === grant.granteeId); return <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"><div><p className="text-sm font-medium text-ink">{member?.name || member?.email || "Destinatar extern"}</p><p className="text-xs text-muted">{label(String(grant.permission))}{grant.expiresAt ? ` · expiră ${new Date(String(grant.expiresAt)).toLocaleString("ro-RO")}` : " · fără expirare"}</p></div><Button size="sm" variant="destructive-outline" disabled={sharing} onClick={() => void revokeShare(grant.id)}>Revocă</Button></div>; })}</div></div></div></Modal>
    <ConfirmDialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} onConfirm={() => { const id = deleteId; setDeleteId(null); if (!id || !currentWorkspace) return; void weddingOsApi.deleteVaultDocument(currentWorkspace.id, id).then(load).then(() => toast({ title: "Ștergere solicitată", description: "Workerul elimină obiectul numai dacă politica de retenție permite.", variant: "success" })).catch((error) => toast({ title: "Documentul nu a fost șters", description: apiErrorMessage(error), variant: "error" })); }} title="Ștergi documentul?" description="Documentele sub legal hold sau retenție activă nu pot fi șterse." confirmLabel="Șterge" destructive />
  </div>;
}

function label(value: string) { return value.toLowerCase().replaceAll("_", " "); }
