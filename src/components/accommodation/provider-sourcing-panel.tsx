"use client";

import * as React from "react";
import type {
  AccommodationInquiryChannel,
  AccommodationProviderInquiryResource,
  AccommodationProviderLeadResource,
  AccommodationProviderLeadStatus,
  AccommodationRecommendationResource,
} from "@weddingos/contracts";
import {
  CheckCircle2,
  ClipboardCheck,
  Handshake,
  MessageSquareReply,
  PhoneCall,
  Plus,
} from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";

const leadStatusLabels: Record<AccommodationProviderLeadStatus, string> = {
  needs_verification: "De verificat",
  ready_to_contact: "Pregătit pentru contact",
  contacted: "Contactat",
  responded: "Răspuns primit",
  qualified: "Calificat",
  rejected: "Respins",
  archived: "Arhivat",
};

const channelLabels: Record<AccommodationInquiryChannel, string> = {
  email: "Email",
  phone: "Telefon",
  contact_form: "Formular web",
  whatsapp: "WhatsApp",
  other: "Alt canal",
};

export function ProviderSourcingPanel({
  recommendation,
  currency,
  canWrite,
}: {
  recommendation: AccommodationRecommendationResource;
  currency: string;
  canWrite: boolean;
}) {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [lead, setLead] =
    React.useState<AccommodationProviderLeadResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [contactName, setContactName] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [contactUrl, setContactUrl] = React.useState("");
  const [verificationNote, setVerificationNote] = React.useState("");

  const [inquiryOpen, setInquiryOpen] = React.useState(false);
  const [channel, setChannel] =
    React.useState<AccommodationInquiryChannel>("email");
  const [checkInDate, setCheckInDate] = React.useState("");
  const [checkOutDate, setCheckOutDate] = React.useState("");
  const [rooms, setRooms] = React.useState("1");
  const [adults, setAdults] = React.useState("2");
  const [children, setChildren] = React.useState("0");
  const [budget, setBudget] = React.useState("");
  const [subject, setSubject] = React.useState(
    `Cerere ofertă de grup · ${recommendation.name}`,
  );
  const [message, setMessage] = React.useState("");
  const [responseDeadline, setResponseDeadline] = React.useState("");

  const [contactSummary, setContactSummary] = React.useState(
    "Cererea a fost transmisă manual furnizorului.",
  );
  const [responseAvailability, setResponseAvailability] = React.useState<
    "available" | "partially_available" | "unavailable"
  >("available");
  const [quotedTotal, setQuotedTotal] = React.useState("");
  const [responseNote, setResponseNote] = React.useState("");
  const [declaredBy, setDeclaredBy] = React.useState("");

  const applyLead = React.useCallback(
    (next: AccommodationProviderLeadResource | null) => {
      setLead(next);
      setContactName(next?.contactName ?? "");
      setContactEmail(next?.contactEmail ?? "");
      setContactPhone(next?.contactPhone ?? recommendation.contactPhone ?? "");
      setContactUrl(next?.contactUrl ?? recommendation.contactUrl ?? "");
      setVerificationNote(next?.verificationNote ?? "");
    },
    [recommendation.contactPhone, recommendation.contactUrl],
  );

  React.useEffect(() => {
    if (!currentWorkspace) return;
    let cancelled = false;
    void weddingOsApi
      .accommodationProviderLeads(currentWorkspace.id, {
        eventId: recommendation.weddingEventId,
      })
      .then((result) => {
        if (cancelled) return;
        applyLead(
          result.items.find(
            (item) => item.recommendationId === recommendation.id,
          ) ?? null,
        );
      })
      .catch((cause) => {
        if (!cancelled) setError(apiErrorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyLead, currentWorkspace, recommendation.id, recommendation.weddingEventId]);

  const createLead = async () => {
    if (!currentWorkspace || !canWrite) return;
    setSaving(true);
    setError(null);
    try {
      const next = await weddingOsApi.createAccommodationProviderLead(
        currentWorkspace.id,
        recommendation.id,
        {
          contactPhone: recommendation.contactPhone,
          contactUrl: recommendation.contactUrl,
        },
      );
      applyLead(next);
      toast({
        title: "Verificarea furnizorului a început",
        description:
          "Completează un canal verificat înainte să pregătești cererea.",
        variant: "success",
      });
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const saveLead = async (status?: AccommodationProviderLeadStatus) => {
    if (!currentWorkspace || !lead || !canWrite) return;
    setSaving(true);
    setError(null);
    try {
      const next = await weddingOsApi.updateAccommodationProviderLead(
        currentWorkspace.id,
        lead.id,
        lead.version,
        {
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
          contactUrl: contactUrl.trim() || null,
          verificationNote: verificationNote.trim() || null,
          ...(status ? { status } : {}),
        },
      );
      applyLead(next);
      toast({
        title:
          status === "ready_to_contact"
            ? "Lead verificat și pregătit"
            : status === "qualified"
              ? "Furnizor calificat"
              : "Datele furnizorului au fost salvate",
        variant: "success",
      });
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const createInquiry = async () => {
    if (!currentWorkspace || !lead || !canWrite) return;
    const budgetNumber = budget.trim() ? Number(budget) : null;
    if (
      !checkInDate ||
      !checkOutDate ||
      checkOutDate <= checkInDate ||
      !message.trim() ||
      !subject.trim() ||
      (budgetNumber !== null && (!Number.isFinite(budgetNumber) || budgetNumber < 0))
    ) {
      setError("Completează intervalul, subiectul și mesajul cererii.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await weddingOsApi.createAccommodationProviderInquiry(
        currentWorkspace.id,
        lead.id,
        {
          channel,
          checkInDate,
          checkOutDate,
          rooms: Number(rooms),
          adults: Number(adults),
          children: Number(children),
          budgetMaxMinor:
            budgetNumber === null ? null : Math.round(budgetNumber * 100),
          currency,
          subject: subject.trim(),
          message: message.trim(),
          responseDeadline: responseDeadline
            ? new Date(responseDeadline).toISOString()
            : null,
        },
      );
      applyLead(next);
      setInquiryOpen(false);
      toast({
        title: "Cererea a fost pregătită",
        description:
          "Nu a fost trimisă automat. Copiază mesajul în canalul ales și înregistrează contactul.",
        variant: "success",
      });
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const recordContact = async (inquiry: AccommodationProviderInquiryResource) => {
    if (!currentWorkspace || !lead || !canWrite) return;
    setSaving(true);
    setError(null);
    try {
      const next = await weddingOsApi.recordAccommodationProviderContact(
        currentWorkspace.id,
        lead.id,
        inquiry.id,
        inquiry.version,
        { channel: inquiry.channel, summary: contactSummary.trim() },
      );
      applyLead(next);
      toast({ title: "Contactarea a fost înregistrată", variant: "success" });
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const recordResponse = async (
    inquiry: AccommodationProviderInquiryResource,
  ) => {
    if (!currentWorkspace || !lead || !canWrite) return;
    const quote = quotedTotal.trim() ? Number(quotedTotal) : null;
    if (
      !responseNote.trim() ||
      (quote !== null && (!Number.isFinite(quote) || quote < 0))
    ) {
      setError("Completează răspunsul furnizorului și verifică suma.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await weddingOsApi.recordAccommodationProviderResponse(
        currentWorkspace.id,
        lead.id,
        inquiry.id,
        inquiry.version,
        {
          channel: inquiry.channel,
          availability: responseAvailability,
          quotedTotalMinor: quote === null ? null : Math.round(quote * 100),
          quoteCurrency: quote === null ? null : currency,
          responseNote: responseNote.trim(),
          declaredByContact: declaredBy.trim() || null,
          decision: "responded",
        },
      );
      applyLead(next);
      setResponseNote("");
      setQuotedTotal("");
      toast({
        title: "Răspunsul furnizorului a fost înregistrat",
        description:
          "Disponibilitatea este etichetată ca declarație a furnizorului, nu verificare live.",
        variant: "success",
      });
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <p className="text-sm text-muted">Se încarcă fluxul de furnizor…</p>
      </section>
    );
  }

  if (!lead) {
    return (
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Handshake className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Verifică și contactează proprietatea
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Creează un lead separat de recomandarea publică. Nimic nu este
                trimis sau rezervat automat.
              </p>
            </div>
          </div>
          {canWrite && (
            <Button variant="outline" onClick={() => void createLead()} loading={saving}>
              <ClipboardCheck className="size-4" aria-hidden /> Începe verificarea
            </Button>
          )}
        </div>
        {error && <ErrorNotice message={error} />}
      </section>
    );
  }

  const canPrepareInquiry = ![
    "needs_verification",
    "rejected",
    "archived",
  ].includes(lead.status);

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Handshake className="size-5 text-brand" aria-hidden />
            <h3 className="text-base font-semibold text-ink">Relația cu furnizorul</h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted">
            Verificare, cereri și răspunsuri păstrate separat de informația publică.
          </p>
        </div>
        <LeadStatusBadge status={lead.status} />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Persoană de contact">
          <Input value={contactName} onChange={(event) => setContactName(event.target.value)} disabled={!canWrite} />
        </Field>
        <Field label="Email">
          <Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} disabled={!canWrite} />
        </Field>
        <Field label="Telefon / WhatsApp">
          <Input type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} disabled={!canWrite} />
        </Field>
        <Field label="Formular sau site de contact">
          <Input type="url" value={contactUrl} onChange={(event) => setContactUrl(event.target.value)} disabled={!canWrite} />
        </Field>
        <Field
          label="Cum ai verificat datele?"
          hint="Obligatoriu înainte de contactare."
          className="sm:col-span-2"
        >
          <Textarea value={verificationNote} onChange={(event) => setVerificationNote(event.target.value)} disabled={!canWrite} maxLength={2000} />
        </Field>
      </div>

      {canWrite && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void saveLead()} loading={saving}>
            Salvează datele
          </Button>
          {lead.status === "needs_verification" && (
            <Button onClick={() => void saveLead("ready_to_contact")} loading={saving}>
              <CheckCircle2 className="size-4" aria-hidden /> Marchează verificat
            </Button>
          )}
          {lead.status === "responded" && (
            <Button onClick={() => void saveLead("qualified")} loading={saving}>
              <CheckCircle2 className="size-4" aria-hidden /> Califică furnizorul
            </Button>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-ink">Cereri de disponibilitate și ofertă</h4>
            <p className="mt-1 text-xs leading-5 text-muted">
              Mesajele sunt pregătite aici și trimise manual prin canalul verificat.
            </p>
          </div>
          {canWrite && canPrepareInquiry && (
            <Button variant="outline" onClick={() => setInquiryOpen((value) => !value)}>
              <Plus className="size-4" aria-hidden /> Cerere nouă
            </Button>
          )}
        </div>

        {inquiryOpen && (
          <div className="mt-4 grid gap-4 rounded-xl bg-subtle p-4 sm:grid-cols-3">
            <Field label="Canal">
              <Select value={channel} onChange={(event) => setChannel(event.target.value as AccommodationInquiryChannel)}>
                {Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Check-in" required><Input type="date" value={checkInDate} onChange={(event) => setCheckInDate(event.target.value)} /></Field>
            <Field label="Check-out" required><Input type="date" value={checkOutDate} onChange={(event) => setCheckOutDate(event.target.value)} /></Field>
            <Field label="Camere"><Input type="number" min="1" value={rooms} onChange={(event) => setRooms(event.target.value)} /></Field>
            <Field label="Adulți"><Input type="number" min="0" value={adults} onChange={(event) => setAdults(event.target.value)} /></Field>
            <Field label="Copii"><Input type="number" min="0" value={children} onChange={(event) => setChildren(event.target.value)} /></Field>
            <Field label={`Buget maxim (${currency})`}><Input type="number" min="0" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} /></Field>
            <Field label="Termen răspuns"><Input type="datetime-local" value={responseDeadline} onChange={(event) => setResponseDeadline(event.target.value)} /></Field>
            <Field label="Subiect" className="sm:col-span-3"><Input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={240} /></Field>
            <Field label="Mesaj" className="sm:col-span-3"><Textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={10000} /></Field>
            <div className="flex justify-end gap-2 sm:col-span-3">
              <Button variant="ghost" onClick={() => setInquiryOpen(false)}>Renunță</Button>
              <Button onClick={() => void createInquiry()} loading={saving}>Pregătește cererea</Button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {lead.inquiries.length === 0 ? (
            <p className="rounded-lg bg-subtle p-4 text-sm text-muted">Nu există încă nicio cerere.</p>
          ) : (
            lead.inquiries.map((inquiry) => (
              <InquiryCard
                key={inquiry.id}
                inquiry={inquiry}
                currency={currency}
                canWrite={canWrite}
                saving={saving}
                contactSummary={contactSummary}
                setContactSummary={setContactSummary}
                responseAvailability={responseAvailability}
                setResponseAvailability={setResponseAvailability}
                quotedTotal={quotedTotal}
                setQuotedTotal={setQuotedTotal}
                responseNote={responseNote}
                setResponseNote={setResponseNote}
                declaredBy={declaredBy}
                setDeclaredBy={setDeclaredBy}
                onContact={() => void recordContact(inquiry)}
                onResponse={() => void recordResponse(inquiry)}
              />
            ))
          )}
        </div>
      </div>
      {error && <ErrorNotice message={error} />}
    </section>
  );
}

function InquiryCard({
  inquiry,
  currency,
  canWrite,
  saving,
  contactSummary,
  setContactSummary,
  responseAvailability,
  setResponseAvailability,
  quotedTotal,
  setQuotedTotal,
  responseNote,
  setResponseNote,
  declaredBy,
  setDeclaredBy,
  onContact,
  onResponse,
}: {
  inquiry: AccommodationProviderInquiryResource;
  currency: string;
  canWrite: boolean;
  saving: boolean;
  contactSummary: string;
  setContactSummary: (value: string) => void;
  responseAvailability: "available" | "partially_available" | "unavailable";
  setResponseAvailability: (value: "available" | "partially_available" | "unavailable") => void;
  quotedTotal: string;
  setQuotedTotal: (value: string) => void;
  responseNote: string;
  setResponseNote: (value: string) => void;
  declaredBy: string;
  setDeclaredBy: (value: string) => void;
  onContact: () => void;
  onResponse: () => void;
}) {
  const canRecordContact = ["draft", "ready"].includes(inquiry.status);
  const canRecordResponse = ["contacted", "responded"].includes(inquiry.status);
  return (
    <article className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{inquiry.subject}</p>
          <p className="mt-1 text-xs text-muted">
            {inquiry.checkInDate} → {inquiry.checkOutDate} · {inquiry.rooms} camere · {inquiry.adults + inquiry.children} persoane
          </p>
        </div>
        <Badge variant={inquiry.status === "responded" || inquiry.status === "accepted" ? "success" : "neutral"}>
          {inquiry.status.replaceAll("_", " ")}
        </Badge>
      </div>
      <p className="mt-3 whitespace-pre-wrap rounded-lg bg-subtle p-3 text-sm leading-6 text-muted">{inquiry.message}</p>
      {inquiry.responseNote && (
        <div className="mt-3 rounded-lg border border-success/25 bg-success-soft/45 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">Declarație furnizor</p>
          <p className="mt-1 text-sm leading-6 text-ink">{inquiry.responseNote}</p>
          <p className="mt-1 text-xs text-muted">
            Disponibilitate: {inquiry.availability.replaceAll("_", " ")}
            {inquiry.quotedTotalMinor !== null ? ` · ${new Intl.NumberFormat("ro-RO", { style: "currency", currency: inquiry.quoteCurrency ?? currency }).format(inquiry.quotedTotalMinor / 100)}` : ""}
          </p>
        </div>
      )}
      {canWrite && canRecordContact && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg bg-subtle p-3 sm:flex-row sm:items-end">
          <Field label="Notă despre contact" className="flex-1">
            <Input value={contactSummary} onChange={(event) => setContactSummary(event.target.value)} />
          </Field>
          <Button onClick={onContact} loading={saving}>
            <PhoneCall className="size-4" aria-hidden /> Am trimis / contactat
          </Button>
        </div>
      )}
      {canWrite && canRecordResponse && (
        <div className="mt-4 grid gap-3 rounded-lg bg-subtle p-3 sm:grid-cols-2">
          <Field label="Disponibilitate declarată">
            <Select value={responseAvailability} onChange={(event) => setResponseAvailability(event.target.value as typeof responseAvailability)}>
              <option value="available">Disponibil</option>
              <option value="partially_available">Parțial disponibil</option>
              <option value="unavailable">Indisponibil</option>
            </Select>
          </Field>
          <Field label={`Ofertă totală (${currency})`}><Input type="number" min="0" step="0.01" value={quotedTotal} onChange={(event) => setQuotedTotal(event.target.value)} /></Field>
          <Field label="Persoana care a răspuns"><Input value={declaredBy} onChange={(event) => setDeclaredBy(event.target.value)} /></Field>
          <Field label="Răspunsul furnizorului" className="sm:col-span-2"><Textarea value={responseNote} onChange={(event) => setResponseNote(event.target.value)} maxLength={4000} /></Field>
          <div className="sm:col-span-2"><Button onClick={onResponse} loading={saving}><MessageSquareReply className="size-4" aria-hidden /> Înregistrează răspunsul</Button></div>
        </div>
      )}
      {inquiry.contactEntries.length > 0 && (
        <ol className="mt-4 space-y-2 border-t border-line pt-3">
          {inquiry.contactEntries.map((entry) => (
            <li key={entry.id} className="text-xs leading-5 text-muted">
              <span className="font-medium text-ink">{entry.direction === "inbound" ? "Răspuns" : "Contact"}</span>{" "}
              · {new Date(entry.occurredAt).toLocaleString("ro-RO")} · {entry.summary}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function LeadStatusBadge({ status }: { status: AccommodationProviderLeadStatus }) {
  return <Badge variant={status === "qualified" || status === "responded" ? "success" : status === "rejected" ? "danger" : "neutral"}>{leadStatusLabels[status]}</Badge>;
}

function ErrorNotice({ message }: { message: string }) {
  return <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{message}</p>;
}
