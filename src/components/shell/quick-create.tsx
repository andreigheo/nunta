"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { taskCategories } from "@/lib/data/tasks";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useShell, type QuickCreateKind } from "./shell-context";

const titles: Record<QuickCreateKind, { title: string; description: string }> =
  {
    task: {
      title: "Sarcină nouă",
      description: "Adaugă o sarcină persistentă în plan.",
    },
    event: {
      title: "Eveniment nou",
      description: "Adaugă un eveniment nativ în calendar.",
    },
    guest: {
      title: "Invitat nou",
      description: "Adaugă un invitat real într-o gospodărie existentă.",
    },
    household: {
      title: "Gospodărie nouă",
      description: "Creează grupul care va primi invitația personalizată.",
    },
    campaign: {
      title: "Trimite campanie",
      description:
        "Creează și pune în coadă o campanie e-mail pentru destinatarii pregătiți.",
    },
    rsvp: {
      title: "Răspunsuri RSVP",
      description: "Deschide centrul de răspunsuri și meniuri.",
    },
    seating_table: {
      title: "Masă nouă",
      description: "Adaugă o masă persistentă într-un plan de seating.",
    },
    transport_route: {
      title: "Rută nouă",
      description: "Adaugă o rută persistentă într-un plan de transport.",
    },
    accommodation_property: {
      title: "Proprietate nouă",
      description: "Adaugă un hotel sau o proprietate în inventarul de cazare.",
    },
    expense: {
      title: "Cheltuială nouă",
      description: "Înregistrează o cheltuială reală pe o poziție de buget.",
    },
    payment: {
      title: "Plată externă",
      description:
        "Înregistrează o plată făcută în afara Sarbato; sistemul nu procesează bani.",
    },
    vendor: {
      title: "Caută furnizor",
      description: "Deschide marketplace-ul cu profiluri publicate.",
    },
    rfq: {
      title: "Cerere de ofertă",
      description: "Deschide fluxul RFQ persistent.",
    },
    contract: {
      title: "Contract",
      description:
        "Contractele se creează din oferte acceptate; upload-ul rămâne dezactivat.",
    },
    risk: {
      title: "Risc nou",
      description: "Adaugă un risc persistent în registrul workspace-ului.",
    },
    risk_detection: {
      title: "Detectare riscuri",
      description:
        "Analizează determinist datele canonice și creează numai riscurile noi.",
    },
    plan_b: {
      title: "Plan B nou",
      description:
        "Creează un plan versionat care trebuie aprobat înainte de activare.",
    },
    automation: {
      title: "Automatizare nouă",
      description:
        "Creează o regulă draft din acțiuni strict permise și verificabile.",
    },
    run_of_show: {
      title: "Moment în Run of Show",
      description: "Adaugă un moment persistent în planul operațional activ.",
    },
    checklist_item: {
      title: "Element de checklist",
      description: "Adaugă o verificare în checklist-ul operațional selectat.",
    },
    incident: {
      title: "Raportează incident",
      description: "Înregistrează un incident operațional real și privat.",
    },
    announcement: {
      title: "Publică anunț",
      description: "Publică un anunț real pentru invitații confirmați.",
    },
    manual_check_in: {
      title: "Check-in manual",
      description: "Înregistrează sosirea invitatului cu motiv auditat.",
    },
    gallery: {
      title: "Colecție galerie",
      description: "Creează o colecție persistentă pentru evenimentul activ.",
    },
  };

const activeKinds = new Set<QuickCreateKind>([
  "task",
  "event",
  "guest",
  "household",
  "campaign",
  "rsvp",
  "seating_table",
  "transport_route",
  "accommodation_property",
  "expense",
  "payment",
  "vendor",
  "rfq",
  "run_of_show",
  "checklist_item",
  "incident",
  "announcement",
  "manual_check_in",
  "gallery",
  "risk",
  "risk_detection",
  "plan_b",
  "automation",
]);

export function QuickCreateModal() {
  const router = useRouter();
  const { quickCreate, setQuickCreate } = useShell();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [values, setValues] = React.useState<Record<string, string>>({
    category: taskCategories[0],
    priority: "medium",
  });
  const [households, setHouseholds] = React.useState<
    Array<{ id: string; name: string }>
  >([]);
  const [operationParents, setOperationParents] = React.useState<
    Array<{ id: string; name: string }>
  >([]);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (quickCreate !== "guest" || !currentWorkspace || demoMode) return;
    void weddingOsApi
      .households(currentWorkspace.id)
      .then((result) =>
        setHouseholds(result.items.map(({ id, name }) => ({ id, name }))),
      )
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, [currentWorkspace, demoMode, quickCreate]);

  React.useEffect(() => {
    if (!currentWorkspace || demoMode || !quickCreate) return;
    const weddingDayKinds: QuickCreateKind[] = [
      "run_of_show",
      "checklist_item",
      "incident",
      "announcement",
      "manual_check_in",
      "gallery",
    ];
    if (!weddingDayKinds.includes(quickCreate)) return;
    void (async () => {
      try {
        const center = await weddingOsApi.weddingDayCommandCenter(
          currentWorkspace.id,
        );
        const plan =
          center.plan && typeof center.plan === "object"
            ? (center.plan as Record<string, unknown>)
            : null;
        const events = Array.isArray(center.availableEvents)
          ? (center.availableEvents as Array<Record<string, unknown>>)
          : [];
        const session =
          center.checkInSession && typeof center.checkInSession === "object"
            ? (center.checkInSession as Record<string, unknown>)
            : null;
        const planId = typeof plan?.id === "string" ? plan.id : "";
        const eventId =
          typeof plan?.eventId === "string"
            ? plan.eventId
            : typeof events[0]?.id === "string"
              ? events[0].id
              : "";
        const sessionId = typeof session?.id === "string" ? session.id : "";
        setValues((current) => ({ ...current, planId, eventId, sessionId }));
        if (
          [
            "run_of_show",
            "checklist_item",
            "incident",
            "announcement",
          ].includes(quickCreate) &&
          !planId
        )
          throw new Error("Creează mai întâi planul operațional Wedding Day.");
        if (quickCreate === "checklist_item") {
          const result = await weddingOsApi.weddingDayChecklists(
            currentWorkspace.id,
            planId,
          );
          setOperationParents(
            result.items.map((item) => ({
              id: item.id,
              name: String(item.title ?? "Checklist"),
            })),
          );
        }
        if (quickCreate === "manual_check_in") {
          if (!sessionId)
            throw new Error(
              "Creează și deschide mai întâi o sesiune de check-in.",
            );
          const result = await weddingOsApi.guests(currentWorkspace.id);
          setOperationParents(
            result.items.map((guest) => ({
              id: guest.id,
              name: `${guest.firstName} ${guest.lastName}`.trim(),
            })),
          );
        }
        if (quickCreate === "gallery" && !eventId)
          throw new Error("Creează mai întâi un eveniment de nuntă.");
      } catch (caught) {
        setError(apiErrorMessage(caught));
      }
    })();
  }, [currentWorkspace, demoMode, quickCreate]);

  React.useEffect(() => {
    if (!currentWorkspace || demoMode || !quickCreate) return;
    if (quickCreate === "seating_table")
      void weddingOsApi
        .seatingPlans(currentWorkspace.id)
        .then((result) =>
          setOperationParents(
            result.items.map((item) => ({
              id: item.id,
              name: String(item.name),
            })),
          ),
        )
        .catch((caught) => setError(apiErrorMessage(caught)));
    if (quickCreate === "transport_route")
      void weddingOsApi
        .transportPlans(currentWorkspace.id)
        .then((result) =>
          setOperationParents(
            result.items.map((item) => ({
              id: item.id,
              name: String(item.name),
            })),
          ),
        )
        .catch((caught) => setError(apiErrorMessage(caught)));
    if (quickCreate === "expense" || quickCreate === "payment")
      void weddingOsApi
        .budget(currentWorkspace.id)
        .then((result) =>
          setOperationParents(
            (Array.isArray(result.items) ? result.items : []).map((item) => ({
              id: String((item as Record<string, unknown>).id),
              name: String((item as Record<string, unknown>).name),
            })),
          ),
        )
        .catch((caught) => setError(apiErrorMessage(caught)));
  }, [currentWorkspace, demoMode, quickCreate]);

  const close = () => {
    setQuickCreate(null);
    setValues({ category: taskCategories[0], priority: "medium" });
    setHouseholds([]);
    setOperationParents([]);
    setError("");
  };
  const set =
    (key: string) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      setValues((current) => ({ ...current, [key]: event.target.value }));
      setError("");
    };
  if (!quickCreate) return null;
  const active = activeKinds.has(quickCreate);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!active || !currentWorkspace) return;
    if (quickCreate === "rsvp") {
      close();
      router.push("/rsvp");
      return;
    }
    if (quickCreate === "vendor" || quickCreate === "rfq") {
      close();
      router.push(quickCreate === "vendor" ? "/marketplace" : "/requests");
      return;
    }
    if (
      !["guest", "manual_check_in", "risk_detection"].includes(quickCreate) &&
      !values.title?.trim()
    ) {
      setError("Titlul sau numele este obligatoriu.");
      return;
    }
    if (
      quickCreate === "guest" &&
      (!values.firstName?.trim() ||
        !values.lastName?.trim() ||
        !values.householdId)
    ) {
      setError("Prenumele, numele și gospodăria sunt obligatorii.");
      return;
    }
    setSaving(true);
    try {
      if (demoMode) {
        toast({
          title: "Acțiune demo salvată",
          description: "Datele demo rămân izolate și nu au produs mutații API.",
          variant: "success",
        });
        close();
        return;
      }
      if (quickCreate === "task") {
        await weddingOsApi.createTask(currentWorkspace.id, {
          title: values.title.trim(),
          description: values.description?.trim() || undefined,
          category: values.category || "planning",
          priority: (values.priority || "medium") as
            "low" | "medium" | "high" | "urgent",
          dueAt: values.date
            ? new Date(`${values.date}T12:00:00`).toISOString()
            : null,
          position: 0,
          isPrivate: false,
        });
      } else if (quickCreate === "event") {
        if (!values.date) {
          setError("Data evenimentului este obligatorie.");
          return;
        }
        await weddingOsApi.createCalendarEvent(currentWorkspace.id, {
          title: values.title.trim(),
          description: values.description?.trim() || undefined,
          eventType: "meeting",
          startAt: new Date(
            `${values.date}T${values.time || "09:00"}:00`,
          ).toISOString(),
          endAt: null,
          allDay: false,
          timezone: bootstrap?.workspace.timezone ?? "Europe/Chisinau",
          location: values.location?.trim() || undefined,
        });
      } else if (quickCreate === "risk") {
        await weddingOsApi.createRisk(currentWorkspace.id, {
          title: values.title.trim(),
          description: values.description?.trim() || undefined,
          category: values.category || "OTHER",
          probability: Number(values.probability || 3),
          impact: Number(values.impact || 3),
          source: "MANUAL",
        });
      } else if (quickCreate === "risk_detection") {
        const result = await weddingOsApi.detectRisks(currentWorkspace.id);
        toast({
          title: "Detectarea riscurilor este în coadă",
          description: `Job ${result.job.id.slice(0, 8)} · rezultatul va apărea în Registrul de riscuri.`,
          variant: "info",
        });
      } else if (quickCreate === "plan_b") {
        await weddingOsApi.createContingencyPlan(currentWorkspace.id, {
          title: values.title.trim(),
          summary: values.description?.trim() || undefined,
          triggers: [{ type: "MANUAL", configuration: {} }],
          actions: [
            {
              title:
                values.action?.trim() ||
                `Aplică măsurile pentru ${values.title.trim()}`,
              position: 0,
            },
          ],
        });
      } else if (quickCreate === "automation") {
        await weddingOsApi.createAutomationRule(currentWorkspace.id, {
          name: values.title.trim(),
          description: values.description?.trim() || undefined,
          triggerType: values.triggerType || "MANUAL",
          triggerConfiguration: {},
          conditions: [],
          actions: [
            {
              type: values.actionType || "CREATE_NOTIFICATION",
              configuration: { title: values.title.trim() },
              position: 0,
            },
          ],
          requiresApproval:
            (values.actionType || "CREATE_NOTIFICATION") !==
            "CREATE_NOTIFICATION",
        });
      } else if (quickCreate === "household") {
        await weddingOsApi.createHousehold(currentWorkspace.id, {
          name: values.title.trim(),
          preferredLanguage: "ro",
          city: values.city?.trim() || null,
          side: (values.side || "COMMON") as
            "PARTNER_ONE" | "PARTNER_TWO" | "COMMON" | "VENDOR" | "OTHER",
        });
      } else if (quickCreate === "guest") {
        await weddingOsApi.createGuest(currentWorkspace.id, {
          householdId: values.householdId,
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: values.email?.trim() || null,
          phone: values.phone?.trim() || null,
          preferredLanguage: "ro",
          side: "COMMON",
          isChild: false,
          isPlusOne: false,
          plusOneAllowed: false,
          needsTransport: false,
          needsAccommodation: false,
        });
      } else if (quickCreate === "campaign") {
        const site = await weddingOsApi.invitationSite(currentWorkspace.id);
        if (!site?.published)
          throw new Error(
            "Publică invitația și pregătește destinatarii înainte de trimitere.",
          );
        const campaign = await weddingOsApi.createCampaign(
          currentWorkspace.id,
          {
            name: values.title.trim(),
            purpose: "INVITATION",
            channel: "EMAIL",
            invitationVersionId: site.published.id,
            template: {
              subject: values.subject?.trim() || values.title.trim(),
              body:
                values.description?.trim() ||
                "Te invităm să confirmi participarea folosind invitația personală.",
            },
            audienceFilter: {},
          },
        );
        await weddingOsApi.transitionCampaign(
          currentWorkspace.id,
          campaign.id,
          campaign.version,
          "SEND_NOW",
        );
      } else if (quickCreate === "seating_table") {
        if (!values.parentId) throw new Error("Selectează planul de mese.");
        await weddingOsApi.createSeatingTable(
          currentWorkspace.id,
          values.parentId,
          {
            name: values.title.trim(),
            label: values.label?.trim() || values.title.trim(),
            shape: "round",
            capacity: Number(values.capacity || 8),
            x: 100,
            y: 100,
            width: 120,
            height: 90,
            rotation: 0,
            position: 0,
            locked: false,
          },
        );
      } else if (quickCreate === "transport_route") {
        if (!values.parentId || !values.date)
          throw new Error("Selectează planul și data plecării.");
        await weddingOsApi.createTransportRoute(
          currentWorkspace.id,
          values.parentId,
          {
            name: values.title.trim(),
            vehicleId: null,
            direction: "to_event",
            departureAt: new Date(
              `${values.date}T${values.time || "09:00"}:00`,
            ).toISOString(),
            originName: values.origin?.trim() || "Punct de plecare",
            destinationName:
              values.destination?.trim() || "Locația evenimentului",
            stops: [],
          },
        );
      } else if (quickCreate === "accommodation_property") {
        await weddingOsApi.createAccommodationProperty(currentWorkspace.id, {
          name: values.title.trim(),
          type: "hotel",
          address: values.address?.trim() || "Adresă de completat",
          city: values.city?.trim() || "Oraș de completat",
          country: "România",
        });
      } else if (quickCreate === "expense") {
        if (!values.parentId || !values.amount || !values.date)
          throw new Error("Poziția de buget, suma și data sunt obligatorii.");
        await weddingOsApi.createExpense(currentWorkspace.id, {
          budgetItemId: values.parentId,
          description: values.title.trim(),
          amountMinor: Math.round(Number(values.amount) * 100),
          expenseDate: values.date,
          status: "INCURRED",
          paymentMethodLabel: values.method?.trim() || null,
          notesPrivate: values.description?.trim() || null,
        });
      } else if (quickCreate === "payment") {
        if (!values.parentId || !values.amount)
          throw new Error("Poziția de buget și suma sunt obligatorii.");
        await weddingOsApi.createCommercialPayment(currentWorkspace.id, {
          budgetItemId: values.parentId,
          amountMinor: Math.round(Number(values.amount) * 100),
          paidAt: values.date
            ? new Date(`${values.date}T12:00:00`).toISOString()
            : new Date().toISOString(),
          method: values.method || "BANK_TRANSFER",
          reference: values.title.trim(),
          notesPrivate: values.description?.trim() || null,
        });
      } else if (quickCreate === "run_of_show") {
        if (!values.planId) throw new Error("Planul operațional lipsește.");
        const start = values.date
          ? new Date(
              `${values.date}T${values.time || "09:00"}:00`,
            ).toISOString()
          : new Date().toISOString();
        await weddingOsApi.createRunOfShowItem(
          currentWorkspace.id,
          values.planId,
          {
            type: "CUSTOM",
            title: values.title.trim(),
            description: values.description?.trim() || null,
            plannedStartAt: start,
            plannedEndAt: null,
            locationName: values.location?.trim() || null,
            priority: values.priority || "MEDIUM",
            position: 0,
            isGuestVisible: false,
            isCritical: values.priority === "CRITICAL",
            requiresConfirmation: false,
            sourceType: "manual",
            sourceId: null,
          },
        );
      } else if (quickCreate === "checklist_item") {
        if (!values.parentId) throw new Error("Selectează checklist-ul.");
        await weddingOsApi.createWeddingDayChecklistItem(
          currentWorkspace.id,
          values.parentId,
          {
            title: values.title.trim(),
            description: values.description?.trim() || null,
            priority: values.priority || "MEDIUM",
            assignedMembershipId: null,
            dueAt: values.date
              ? new Date(
                  `${values.date}T${values.time || "09:00"}:00`,
                ).toISOString()
              : null,
            sourceTaskId: null,
            position: 0,
          },
        );
      } else if (quickCreate === "incident") {
        if (!values.planId || !values.description?.trim())
          throw new Error(
            "Planul și descrierea incidentului sunt obligatorii.",
          );
        await weddingOsApi.createWeddingDayIncident(
          currentWorkspace.id,
          values.planId,
          {
            type: values.incidentType || "OTHER",
            severity: values.priority || "MEDIUM",
            title: values.title.trim(),
            descriptionPrivate: values.description.trim(),
            assignedToMembershipId: null,
            relatedRunOfShowItemId: null,
            relatedVendorBookingId: null,
          },
        );
      } else if (quickCreate === "announcement") {
        if (!values.planId || !values.description?.trim())
          throw new Error("Planul și mesajul sunt obligatorii.");
        const announcement = await weddingOsApi.createWeddingDayAnnouncement(
          currentWorkspace.id,
          values.planId,
          {
            title: values.title.trim(),
            body: values.description.trim(),
            priority: values.announcementPriority || "INFO",
            publishAt: null,
            expiresAt: null,
            channels: ["GUEST_COMPANION", "IN_APP"],
            audiences: [{ type: "ALL_CONFIRMED_GUESTS", selector: {} }],
          },
        );
        await weddingOsApi.publishWeddingDayAnnouncement(
          currentWorkspace.id,
          announcement.id,
          announcement.version,
        );
      } else if (quickCreate === "manual_check_in") {
        if (!values.sessionId || !values.parentId || !values.reason?.trim())
          throw new Error("Sesiunea, invitatul și motivul sunt obligatorii.");
        await weddingOsApi.manualGuestCheckIn(
          currentWorkspace.id,
          values.sessionId,
          values.parentId,
          values.reason.trim(),
        );
      } else if (quickCreate === "gallery") {
        if (!values.eventId) throw new Error("Evenimentul lipsește.");
        await weddingOsApi.createGallery(currentWorkspace.id, {
          weddingEventId: values.eventId,
          name: values.title.trim(),
          description: values.description?.trim() || null,
          visibility: "GUESTS_WITH_ACCESS",
          householdIds: [],
        });
      }
      window.dispatchEvent(new CustomEvent("weddingos:planning-changed"));
      toast({
        title:
          quickCreate === "campaign"
            ? "Campanie pusă în coadă"
            : quickCreate === "guest"
              ? "Invitat adăugat"
              : quickCreate === "household"
                ? "Gospodărie creată"
                : quickCreate === "task"
                  ? "Sarcină creată"
                  : quickCreate === "risk"
                    ? "Risc adăugat"
                    : quickCreate === "risk_detection"
                      ? "Detectare pornită"
                      : quickCreate === "plan_b"
                        ? "Plan B creat ca draft"
                        : quickCreate === "automation"
                          ? "Automatizare creată ca draft"
                    : quickCreate === "seating_table"
                      ? "Masă adăugată"
                      : quickCreate === "transport_route"
                        ? "Rută adăugată"
                        : quickCreate === "accommodation_property"
                          ? "Proprietate adăugată"
                          : quickCreate === "expense"
                            ? "Cheltuială înregistrată"
                            : quickCreate === "payment"
                              ? "Plată externă înregistrată"
                              : quickCreate === "run_of_show"
                                ? "Moment adăugat"
                                : quickCreate === "checklist_item"
                                  ? "Verificare adăugată"
                                  : quickCreate === "incident"
                                    ? "Incident raportat"
                                    : quickCreate === "announcement"
                                      ? "Anunț publicat"
                                      : quickCreate === "manual_check_in"
                                        ? "Check-in înregistrat"
                                        : quickCreate === "gallery"
                                          ? "Colecție creată"
                                          : "Eveniment creat",
        description:
          quickCreate === "campaign"
            ? "Intenția durabilă a fost salvată; livrarea e-mailurilor este asincronă."
            : quickCreate === "payment"
              ? "Sarbato a salvat evidența operațională; nu a procesat și nu a transferat bani."
              : undefined,
        variant:
          quickCreate === "campaign" || quickCreate === "payment"
            ? "info"
            : "success",
      });
      close();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title={titles[quickCreate].title}
      description={titles[quickCreate].description}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Renunță
          </Button>
          <Button
            type="submit"
            form="quick-create-form"
            disabled={!active}
            loading={saving}
          >
            {!active
              ? "Disponibil ulterior"
              : quickCreate === "rsvp"
                ? "Deschide RSVP"
                : quickCreate === "vendor" || quickCreate === "rfq"
                  ? "Deschide"
                  : quickCreate === "campaign"
                    ? "Trimite"
                    : "Salvează"}
          </Button>
        </>
      }
    >
      <form
        id="quick-create-form"
        onSubmit={submit}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {!active ? (
          <div className="sm:col-span-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-3 text-sm text-warning">
            Acest control este planificat și nu afișează succes fals.
          </div>
        ) : quickCreate === "risk_detection" ? (
          <p className="sm:col-span-2 text-sm text-muted">
            Motorul determinist verifică taskurile întârziate, milestone-urile,
            furnizorii și semnalele operaționale. Execuția este asincronă și
            deduplicată.
          </p>
        ) : quickCreate === "rsvp" ? (
          <p className="sm:col-span-2 text-sm text-muted">
            Vei deschide datele RSVP reale, filtrate pentru workspace-ul curent.
          </p>
        ) : quickCreate === "vendor" || quickCreate === "rfq" ? (
          <p className="sm:col-span-2 text-sm text-muted">
            Vei deschide{" "}
            {quickCreate === "vendor"
              ? "marketplace-ul real"
              : "centrul RFQ persistent"}{" "}
            în workspace-ul curent.
          </p>
        ) : quickCreate === "manual_check_in" ? (
          <>
            <Field
              label="Invitat"
              required
              className="sm:col-span-2"
              error={error}
            >
              <Select value={values.parentId ?? ""} onChange={set("parentId")}>
                <option value="">Selectează</option>
                {operationParents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Motivul override-ului"
              required
              className="sm:col-span-2"
            >
              <Textarea
                value={values.reason ?? ""}
                onChange={set("reason")}
                placeholder="Ex.: verificare manuală la intrare"
              />
            </Field>
          </>
        ) : quickCreate === "guest" ? (
          <>
            <Field label="Prenume" required error={error}>
              <Input
                autoFocus
                value={values.firstName ?? ""}
                onChange={set("firstName")}
                invalid={Boolean(error)}
              />
            </Field>
            <Field label="Nume" required>
              <Input value={values.lastName ?? ""} onChange={set("lastName")} />
            </Field>
            <Field label="Gospodărie" required className="sm:col-span-2">
              <Select
                value={values.householdId ?? ""}
                onChange={set("householdId")}
              >
                <option value="">Selectează</option>
                {households.map((household) => (
                  <option key={household.id} value={household.id}>
                    {household.name}
                  </option>
                ))}
              </Select>
            </Field>
            {!households.length && (
              <p className="sm:col-span-2 text-xs text-warning">
                Creează mai întâi o gospodărie.
              </p>
            )}
            <Field label="E-mail">
              <Input
                type="email"
                value={values.email ?? ""}
                onChange={set("email")}
              />
            </Field>
            <Field label="Telefon">
              <Input value={values.phone ?? ""} onChange={set("phone")} />
            </Field>
          </>
        ) : (
          <>
            <Field
              label={
                quickCreate === "household"
                  ? "Numele gospodăriei"
                  : quickCreate === "campaign"
                    ? "Numele campaniei"
                    : quickCreate === "task"
                      ? "Titlul sarcinii"
                      : quickCreate === "seating_table"
                        ? "Numele mesei"
                        : quickCreate === "transport_route"
                          ? "Numele rutei"
                          : quickCreate === "accommodation_property"
                            ? "Numele proprietății"
                            : quickCreate === "run_of_show"
                              ? "Titlul momentului"
                              : quickCreate === "checklist_item"
                                ? "Verificarea"
                                : quickCreate === "incident"
                                  ? "Titlul incidentului"
                                  : quickCreate === "announcement"
                                    ? "Titlul anunțului"
                                    : quickCreate === "gallery"
                                      ? "Numele colecției"
                                      : "Titlul evenimentului"
              }
              required
              error={error}
              className="sm:col-span-2"
            >
              <Input
                autoFocus
                value={values.title ?? ""}
                onChange={set("title")}
                invalid={Boolean(error)}
              />
            </Field>
            {quickCreate === "campaign" && (
              <Field label="Subiect e-mail" required className="sm:col-span-2">
                <Input value={values.subject ?? ""} onChange={set("subject")} />
              </Field>
            )}
            {![
              "household",
              "seating_table",
              "transport_route",
              "accommodation_property",
            ].includes(quickCreate) && (
              <Field
                label={quickCreate === "campaign" ? "Mesaj" : "Descriere"}
                className="sm:col-span-2"
              >
                <Textarea
                  value={values.description ?? ""}
                  onChange={set("description")}
                />
              </Field>
            )}
            {quickCreate === "task" ? (
              <>
                <Field label="Categorie">
                  <Select value={values.category} onChange={set("category")}>
                    {taskCategories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Prioritate">
                  <Select value={values.priority} onChange={set("priority")}>
                    <option value="low">Scăzută</option>
                    <option value="medium">Medie</option>
                    <option value="high">Ridicată</option>
                    <option value="urgent">Urgentă</option>
                  </Select>
                </Field>
                <Field label="Termen">
                  <Input
                    type="date"
                    value={values.date ?? ""}
                    onChange={set("date")}
                  />
                </Field>
              </>
            ) : quickCreate === "risk" ? (
              <>
                <Field label="Categorie">
                  <Select
                    value={values.category ?? "OTHER"}
                    onChange={set("category")}
                  >
                    <option value="SCHEDULE">Calendar</option>
                    <option value="VENDOR">Furnizori</option>
                    <option value="BUDGET">Buget</option>
                    <option value="GUEST">Invitați</option>
                    <option value="LOGISTICS">Logistică</option>
                    <option value="WEATHER">Meteo</option>
                    <option value="OTHER">Altele</option>
                  </Select>
                </Field>
                <Field label="Probabilitate">
                  <Select
                    value={values.probability ?? "3"}
                    onChange={set("probability")}
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}/5
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Impact">
                  <Select value={values.impact ?? "3"} onChange={set("impact")}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}/5
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : quickCreate === "plan_b" ? (
              <Field label="Prima acțiune" className="sm:col-span-2">
                <Input
                  value={values.action ?? ""}
                  onChange={set("action")}
                  placeholder="Ex.: confirmă furnizorul alternativ"
                />
              </Field>
            ) : quickCreate === "automation" ? (
              <>
                <Field label="Declanșator">
                  <Select
                    value={values.triggerType ?? "MANUAL"}
                    onChange={set("triggerType")}
                  >
                    <option value="MANUAL">Manual</option>
                    <option value="TASK_OVERDUE">Task întârziat</option>
                    <option value="RISK_LEVEL_CHANGED">Nivel risc schimbat</option>
                    <option value="MILESTONE_APPROACHING">Milestone apropiat</option>
                    <option value="SCHEDULED">Programat</option>
                  </Select>
                </Field>
                <Field label="Acțiune">
                  <Select
                    value={values.actionType ?? "CREATE_NOTIFICATION"}
                    onChange={set("actionType")}
                  >
                    <option value="CREATE_NOTIFICATION">Notificare</option>
                    <option value="CREATE_TASK">Task</option>
                    <option value="CREATE_RISK">Risc</option>
                    <option value="CREATE_CALENDAR_EVENT">Eveniment</option>
                  </Select>
                </Field>
              </>
            ) : quickCreate === "event" ? (
              <>
                <Field label="Data" required>
                  <Input
                    type="date"
                    value={values.date ?? ""}
                    onChange={set("date")}
                  />
                </Field>
                <Field label="Ora">
                  <Input
                    type="time"
                    value={values.time ?? "09:00"}
                    onChange={set("time")}
                  />
                </Field>
                <Field label="Locație" className="sm:col-span-2">
                  <Input
                    value={values.location ?? ""}
                    onChange={set("location")}
                  />
                </Field>
              </>
            ) : quickCreate === "household" ? (
              <>
                <Field label="Oraș">
                  <Input value={values.city ?? ""} onChange={set("city")} />
                </Field>
                <Field label="Parte">
                  <Select
                    value={values.side ?? "COMMON"}
                    onChange={set("side")}
                  >
                    <option value="COMMON">Comună</option>
                    <option value="PARTNER_ONE">Partener 1</option>
                    <option value="PARTNER_TWO">Partener 2</option>
                  </Select>
                </Field>
              </>
            ) : quickCreate === "seating_table" ? (
              <>
                <Field label="Plan" className="sm:col-span-2">
                  <Select
                    value={values.parentId ?? ""}
                    onChange={set("parentId")}
                  >
                    <option value="">Selectează</option>
                    {operationParents.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Etichetă">
                  <Input value={values.label ?? ""} onChange={set("label")} />
                </Field>
                <Field label="Capacitate">
                  <Input
                    type="number"
                    min="1"
                    value={values.capacity ?? "8"}
                    onChange={set("capacity")}
                  />
                </Field>
              </>
            ) : quickCreate === "transport_route" ? (
              <>
                <Field label="Plan" className="sm:col-span-2">
                  <Select
                    value={values.parentId ?? ""}
                    onChange={set("parentId")}
                  >
                    <option value="">Selectează</option>
                    {operationParents.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Plecare">
                  <Input value={values.origin ?? ""} onChange={set("origin")} />
                </Field>
                <Field label="Destinație">
                  <Input
                    value={values.destination ?? ""}
                    onChange={set("destination")}
                  />
                </Field>
                <Field label="Data" required>
                  <Input
                    type="date"
                    value={values.date ?? ""}
                    onChange={set("date")}
                  />
                </Field>
                <Field label="Ora">
                  <Input
                    type="time"
                    value={values.time ?? "09:00"}
                    onChange={set("time")}
                  />
                </Field>
              </>
            ) : quickCreate === "accommodation_property" ? (
              <>
                <Field label="Adresă" className="sm:col-span-2">
                  <Input
                    value={values.address ?? ""}
                    onChange={set("address")}
                  />
                </Field>
                <Field label="Oraș">
                  <Input value={values.city ?? ""} onChange={set("city")} />
                </Field>
                <Field label="Țară">
                  <Input value="România" disabled />
                </Field>
              </>
            ) : quickCreate === "expense" || quickCreate === "payment" ? (
              <>
                <Field
                  label="Poziție de buget"
                  required
                  className="sm:col-span-2"
                >
                  <Select
                    value={values.parentId ?? ""}
                    onChange={set("parentId")}
                  >
                    <option value="">Selectează</option>
                    {operationParents.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sumă" required>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={values.amount ?? ""}
                    onChange={set("amount")}
                  />
                </Field>
                <Field
                  label={
                    quickCreate === "payment"
                      ? "Data plății"
                      : "Data cheltuielii"
                  }
                  required={quickCreate === "expense"}
                >
                  <Input
                    type="date"
                    value={values.date ?? ""}
                    onChange={set("date")}
                  />
                </Field>
                {quickCreate === "payment" ? (
                  <Field label="Metodă">
                    <Select
                      value={values.method ?? "BANK_TRANSFER"}
                      onChange={set("method")}
                    >
                      <option value="BANK_TRANSFER">Transfer bancar</option>
                      <option value="CARD_EXTERNAL">Card extern</option>
                      <option value="CASH">Numerar</option>
                      <option value="OTHER">Alta</option>
                    </Select>
                  </Field>
                ) : (
                  <Field label="Metodă">
                    <Input
                      value={values.method ?? ""}
                      onChange={set("method")}
                    />
                  </Field>
                )}
              </>
            ) : quickCreate === "run_of_show" ? (
              <>
                <Field label="Prioritate">
                  <Select
                    value={values.priority ?? "MEDIUM"}
                    onChange={set("priority")}
                  >
                    <option value="LOW">Scăzută</option>
                    <option value="MEDIUM">Medie</option>
                    <option value="HIGH">Ridicată</option>
                    <option value="CRITICAL">Critică</option>
                  </Select>
                </Field>
                <Field label="Locație">
                  <Input
                    value={values.location ?? ""}
                    onChange={set("location")}
                  />
                </Field>
                <Field label="Data">
                  <Input
                    type="date"
                    value={values.date ?? ""}
                    onChange={set("date")}
                  />
                </Field>
                <Field label="Ora">
                  <Input
                    type="time"
                    value={values.time ?? "09:00"}
                    onChange={set("time")}
                  />
                </Field>
              </>
            ) : quickCreate === "checklist_item" ? (
              <>
                <Field label="Checklist" required className="sm:col-span-2">
                  <Select
                    value={values.parentId ?? ""}
                    onChange={set("parentId")}
                  >
                    <option value="">Selectează</option>
                    {operationParents.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Prioritate">
                  <Select
                    value={values.priority ?? "MEDIUM"}
                    onChange={set("priority")}
                  >
                    <option value="LOW">Scăzută</option>
                    <option value="MEDIUM">Medie</option>
                    <option value="HIGH">Ridicată</option>
                    <option value="CRITICAL">Critică</option>
                  </Select>
                </Field>
                <Field label="Termen">
                  <Input
                    type="date"
                    value={values.date ?? ""}
                    onChange={set("date")}
                  />
                </Field>
              </>
            ) : quickCreate === "incident" ? (
              <>
                <Field label="Tip">
                  <Select
                    value={values.incidentType ?? "OTHER"}
                    onChange={set("incidentType")}
                  >
                    <option value="SCHEDULE">Program</option>
                    <option value="VENDOR">Furnizor</option>
                    <option value="VENUE">Locație</option>
                    <option value="GUEST">Invitat</option>
                    <option value="MEDICAL">Medical</option>
                    <option value="SECURITY">Securitate</option>
                    <option value="TECHNICAL">Tehnic</option>
                    <option value="OTHER">Altul</option>
                  </Select>
                </Field>
                <Field label="Severitate">
                  <Select
                    value={values.priority ?? "MEDIUM"}
                    onChange={set("priority")}
                  >
                    <option value="LOW">Scăzută</option>
                    <option value="MEDIUM">Medie</option>
                    <option value="HIGH">Ridicată</option>
                    <option value="CRITICAL">Critică</option>
                  </Select>
                </Field>
              </>
            ) : quickCreate === "announcement" ? (
              <Field label="Prioritate">
                <Select
                  value={values.announcementPriority ?? "INFO"}
                  onChange={set("announcementPriority")}
                >
                  <option value="INFO">Informare</option>
                  <option value="IMPORTANT">Important</option>
                  <option value="URGENT">Urgent</option>
                </Select>
              </Field>
            ) : null}
          </>
        )}
      </form>
    </Modal>
  );
}
