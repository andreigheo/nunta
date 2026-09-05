"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type {
  EventType,
  OnboardingDraftResource,
  UpdateOnboardingDraft,
} from "@weddingos/contracts";
import {
  ArrowLeft,
  ArrowRight,
  CalendarHeart,
  Camera,
  Flower2,
  Gem,
  Heart,
  ImagePlus,
  Leaf,
  LoaderCircle,
  Minus,
  Mountain,
  Palmtree,
  Plus,
  Save,
  Sparkles,
  Star,
  Sun,
  Tent,
  Users,
} from "lucide-react";
import { SarbatoMark } from "@/components/brand/sarbato-mark";
import { cn, formatRON } from "@/lib/utils";
import { Button, CurrencyInput, Field, Input, Progress, Select, Switch, useToast } from "@/components/ui";
import { ThemeSegmentedControl } from "@/lib/theme";
import { apiErrorMessage, hasDemoCookie, weddingOsApi } from "@/lib/api/client";

const steps = [
  { id: 1, title: "Evenimentul", hint: "Ce organizezi și cine îl coordonează?" },
  { id: 2, title: "Data & momentele", hint: "Când are loc și ce momente include?" },
  { id: 3, title: "Locația", hint: "Unde va avea loc?" },
  { id: 4, title: "Invitații", hint: "Câți oameni așteptați?" },
  { id: 5, title: "Bugetul", hint: "Cu ce resurse lucrați?" },
  { id: 6, title: "Stilul", hint: "Cum arată evenimentul vostru?" },
  { id: 7, title: "Progres existent", hint: "Ce ați rezolvat deja?" },
  { id: 8, title: "Preferințe", hint: "Cum vă ajutăm cel mai bine?" },
];

const eventTypeOptions: Array<{ value: EventType; label: string }> = [
  { value: "wedding", label: "Nuntă" },
  { value: "baptism", label: "Botez" },
  { value: "birthday", label: "Aniversare" },
  { value: "corporate", label: "Eveniment corporate" },
  { value: "conference", label: "Conferință" },
  { value: "anniversary", label: "Jubileu" },
  { value: "private_party", label: "Petrecere privată" },
  { value: "festival", label: "Festival" },
  { value: "fundraiser", label: "Eveniment caritabil" },
  { value: "other", label: "Alt tip de eveniment" },
];

function eventTypeLabel(value: string | undefined) {
  return (
    eventTypeOptions.find((option) => option.value === value)?.label ??
    "Eveniment"
  );
}

const styleOptions = [
  { id: "modern", label: "Modern", icon: Sun },
  { id: "classic", label: "Clasic", icon: Gem },
  { id: "romantic", label: "Romantic", icon: Heart },
  { id: "minimal", label: "Minimal", icon: Minus },
  { id: "rustic", label: "Rustic", icon: Tent },
  { id: "luxury", label: "Lux", icon: Star },
  { id: "garden", label: "Grădină", icon: Flower2 },
  { id: "boho", label: "Boem", icon: Leaf },
  { id: "traditional", label: "Tradițional", icon: Users },
  { id: "destination", label: "Destinație", icon: Palmtree },
  { id: "mountain", label: "La munte", icon: Mountain },
  { id: "custom", label: "Personalizat", icon: Sparkles },
];

const priorities = ["Locația", "Mâncarea", "Muzica", "Fotografia", "Decorul", "Experiența invitaților", "Ținutele", "Cazarea"];

const profilePhotoSlots = [
  { id: "one", label: "Partener 1", valueKey: "partnerOnePhotoId" },
  { id: "two", label: "Partener 2", valueKey: "partnerTwoPhotoId" },
] as const;
const allowedProfilePhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const profilePhotoMaximumBytes = 10 * 1024 * 1024;

type ProfilePhotoSlot = (typeof profilePhotoSlots)[number]["id"];
type ProfilePhotoSelection = {
  file?: File;
  objectId?: string;
  previewUrl: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = React.useState(1);
  const [values, setValues] = React.useState<Record<string, string>>({
    eventType: "",
    country: "",
    region: "",
    currency: "RON",
    flexibility: "moderat",
    aiLevel: "echilibrat",
    notifFreq: "saptamanal",
    weeklyTime: "3-5",
  });
  const [toggles, setToggles] = React.useState<Record<string, boolean>>({
    civil: true,
    religious: true,
    reception: true,
    welcomeDinner: false,
    brunch: false,
    venueSelected: true,
    destination: false,
    flexibleDate: false,
  });
  const [styles, setStyles] = React.useState<string[]>(["garden", "romantic"]);
  const [selectedPriorities, setSelectedPriorities] = React.useState<string[]>(["Locația", "Mâncarea", "Fotografia"]);
  const [progress, setProgress] = React.useState<Record<string, boolean>>({});
  const [extraEvents, setExtraEvents] = React.useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [draftVersion, setDraftVersion] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [loadingDraft, setLoadingDraft] = React.useState(true);
  const [profilePhotos, setProfilePhotos] = React.useState<Record<ProfilePhotoSlot, ProfilePhotoSelection | null>>({
    one: null,
    two: null,
  });
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = React.useState<ProfilePhotoSlot | null>(null);
  const profilePhotoInputs = React.useRef<Record<ProfilePhotoSlot, HTMLInputElement | null>>({ one: null, two: null });

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  const toggle = (key: string) => (c: boolean) => setToggles((t) => ({ ...t, [key]: c }));

  const selectProfilePhoto = (slot: ProfilePhotoSlot, file: File | undefined) => {
    if (!file) return;
    if (!allowedProfilePhotoTypes.has(file.type)) {
      toast({
        title: "Format de imagine neacceptat",
        description: "Alege o fotografie JPG, PNG sau WebP.",
        variant: "error",
      });
      return;
    }
    if (file.size <= 0 || file.size > profilePhotoMaximumBytes) {
      toast({
        title: "Fotografia este prea mare",
        description: "Dimensiunea maximă este 10 MB.",
        variant: "error",
      });
      return;
    }
    setProfilePhotos((current) => {
      const previous = current[slot];
      if (previous?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(previous.previewUrl);
      return {
        ...current,
        [slot]: { file, previewUrl: URL.createObjectURL(file) },
      };
    });
  };

  const uploadProfilePhoto = async (selectedWorkspaceId: string, slot: ProfilePhotoSlot, file: File) => {
    setUploadingProfilePhoto(slot);
    try {
      const bytes = await file.arrayBuffer();
      const checksumSha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const session = await weddingOsApi.createUploadSession(selectedWorkspaceId, {
        purpose: "PROFILE_IMAGE",
        originalFileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        checksumSha256,
      });
      await weddingOsApi.putSignedUpload(session.upload.url, file, session.upload.headers);
      const completed = await weddingOsApi.completeUploadSession(session.id, checksumSha256);
      const objectId = String(completed.storageObjectId ?? "");
      if (!objectId) throw new Error("Storage-ul nu a returnat identificatorul fotografiei.");
      return objectId;
    } finally {
      setUploadingProfilePhoto(null);
    }
  };

  const persistProfilePhotos = async (selectedWorkspaceId: string) => {
    let nextValues = values;
    for (const slot of profilePhotoSlots) {
      const selected = profilePhotos[slot.id];
      if (!selected?.file) continue;
      const objectId = await uploadProfilePhoto(selectedWorkspaceId, slot.id, selected.file);
      nextValues = { ...nextValues, [slot.valueKey]: objectId };
      setValues((current) => ({ ...current, [slot.valueKey]: objectId }));
      setProfilePhotos((current) => ({
        ...current,
        [slot.id]: current[slot.id]
          ? { previewUrl: current[slot.id]!.previewUrl, objectId }
          : null,
      }));
    }
    return nextValues;
  };

  const isWedding = values.eventType === "wedding";
  const canContinue =
    step !== 1 ||
    Boolean(
      values.eventType &&
        (isWedding
          ? values.partnerOne?.trim() && values.partnerTwo?.trim()
          : values.title?.trim() && values.organizerName?.trim()),
    );
  const canSkip = [4, 5, 6].includes(step);

  const hydrateDraft = React.useCallback((draft: OnboardingDraftResource) => {
    const sections = [draft.couple, draft.dateEvents, draft.location, draft.guests, draft.budget, draft.style, draft.planningPreferences];
    const nextValues: Record<string, string> = {};
    for (const section of sections) {
      for (const [key, value] of Object.entries(section))
        if (typeof value === "string" && value.trim()) nextValues[key] = value;
    }
    setValues((current) => ({ ...current, ...nextValues }));
    setToggles((current) => ({ ...current, ...booleanRecord(draft.dateEvents), ...booleanRecord(draft.location) }));
    if (Array.isArray(draft.dateEvents.extraEvents)) setExtraEvents(draft.dateEvents.extraEvents.filter((item): item is string => typeof item === "string"));
    if (Array.isArray(draft.budget.priorities)) setSelectedPriorities(draft.budget.priorities.filter((item): item is string => typeof item === "string"));
    if (Array.isArray(draft.style.styles)) setStyles(draft.style.styles.filter((item): item is string => typeof item === "string"));
    setProgress(booleanRecord(draft.existingProgress));
    setStep(draft.status === "ready" ? 8 : draft.currentStep);
    setDraftVersion(draft.version);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (hasDemoCookie()) {
        setLoadingDraft(false);
        return;
      }
      void weddingOsApi
        .workspaces()
        .then(async (workspaces) => {
          const current = workspaces[0];
          if (!current || cancelled) return;
          setWorkspaceId(current.id);
          setValues((values) => ({
            ...values,
            title: values.title || current.title,
            eventType: values.eventType || current.eventType,
            organizerName: values.organizerName || current.organizerName || "",
            date: values.date || current.eventDate || "",
            city: values.city || current.location || "",
          }));
          const draft = await weddingOsApi.onboarding(current.id);
          if (!cancelled) hydrateDraft(draft);
        })
        .catch((error) => {
          if (!cancelled)
            toast({ title: "Configurarea nu a putut fi încărcată", description: apiErrorMessage(error), variant: "error" });
        })
        .finally(() => {
          if (!cancelled) setLoadingDraft(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [hydrateDraft, toast]);

  const persistStep = async (nextStep = step) => {
    if (hasDemoCookie()) return null;
    let selectedWorkspaceId = workspaceId;
    let version = draftVersion;
    if (!selectedWorkspaceId) {
      const eventType = (values.eventType || "other") as EventType;
      const created = await weddingOsApi.createWorkspace({
        title:
          values.title?.trim() ||
          (eventType === "wedding"
            ? `${values.partnerOne} & ${values.partnerTwo}`
            : eventTypeLabel(eventType)),
        eventType,
        organizerName: values.organizerName?.trim() || undefined,
        ...(eventType === "wedding"
          ? {
              partnerOneName: values.partnerOne,
              partnerTwoName: values.partnerTwo,
            }
          : {}),
        ...(values.date ? { eventDate: values.date } : {}),
        ...(values.venueAddress?.trim() || values.city?.trim() || values.region
          ? { location: values.venueAddress?.trim() || values.city?.trim() || values.region }
          : {}),
        locale: "ro-RO",
        timezone: "Europe/Bucharest",
        currency: values.currency || "RON",
      });
      selectedWorkspaceId = created.id;
      setWorkspaceId(created.id);
      const draft = await weddingOsApi.onboarding(created.id);
      version = draft.version;
    }
    const persistedValues = step === 1 ? await persistProfilePhotos(selectedWorkspaceId) : values;
    if (version === null) throw new Error("Versiunea draftului lipsește.");
    const updated = await weddingOsApi.updateOnboarding(
      selectedWorkspaceId,
      { currentStep: Math.min(nextStep, 8), ...sectionForStep(step, persistedValues, toggles, styles, selectedPriorities, progress, extraEvents) },
      version,
    );
    setDraftVersion(updated.version);
    return updated;
  };

  const advance = async (target = Math.min(step + 1, 8)) => {
    setSaving(true);
    try {
      await persistStep(target);
      setStep(target);
    } catch (error) {
      toast({ title: "Etapa nu a putut fi salvată", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const saveAndExit = async () => {
    if (hasDemoCookie()) {
      router.push("/overview?demo=1");
      return;
    }
    setSaving(true);
    try {
      await persistStep(step);
      router.push("/overview");
    } catch (error) {
      toast({ title: "Configurarea nu a putut fi salvată", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    if (hasDemoCookie()) {
      router.push("/plan?demo=1");
      return;
    }
    setSaving(true);
    try {
      const saved = await persistStep(8);
      if (!saved) throw new Error("Draftul nu a fost salvat.");
      const result = await weddingOsApi.completeOnboarding(saved.workspaceId, saved.version);
      toast({ title: "Configurare finalizată", description: result.message, variant: "success" });
      router.push("/plan?generate=1");
      router.refresh();
    } catch (error) {
      toast({ title: "Configurarea nu a putut fi finalizată", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loadingDraft) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10" aria-busy="true">
        <div className="w-full max-w-sm text-center">
          <SarbatoMark href="/" compact className="justify-center" />
          <div className="mt-8 rounded-2xl bg-surface p-6 shadow-card" role="status" aria-live="polite">
            <span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-brand-soft text-brand-strong dark:text-brand">
              <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden />
            </span>
            <h1 className="mt-5 font-brand text-2xl font-semibold tracking-[-0.02em] text-ink">
              Pregătim configurarea
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">Se încarcă progresul salvat al evenimentului…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <span className="flex items-center gap-3">
            <SarbatoMark href="/" compact />
            <span className="hidden h-5 w-px bg-line sm:block" aria-hidden />
            <span className="hidden font-brand text-lg font-semibold tracking-tight text-ink sm:block">
              Configurare eveniment
            </span>
          </span>
          <div className="flex items-center gap-2">
            <ThemeSegmentedControl className="hidden sm:inline-flex" />
            <Button variant="ghost" size="sm" onClick={() => void saveAndExit()} disabled={saving}>
              <Save className="size-3.5" aria-hidden />
              Salvează și ieși
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <div className="flex items-center justify-between text-xs text-faint">
            <span>Pasul {step} din {steps.length}</span>
            <span>{Math.round((step / steps.length) * 100)}%</span>
          </div>
          <Progress value={step} max={steps.length} className="mt-1.5" aria-label="Progres configurare" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 pb-44 sm:pb-32">
        <h1 className="font-brand text-3xl font-semibold tracking-tight text-ink">{steps[step - 1].title}</h1>
        <p className="mt-1.5 text-[15px] text-muted">{steps[step - 1].hint}</p>

        <div className="mt-7">
          {/* ---------------- Step 1: Event identity ---------------- */}
          {step === 1 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipul evenimentului" required className="sm:col-span-2">
                <Select value={values.eventType ?? ""} onChange={set("eventType")}>
                  <option value="" disabled>
                    Alege tipul evenimentului
                  </option>
                  {eventTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {isWedding ? (
                <>
                  <Field label="Numele partenerului 1" required>
                    <Input placeholder="Ana Dumitrescu" value={values.partnerOne ?? ""} onChange={set("partnerOne")} />
                  </Field>
                  <Field label="Numele partenerului 2" required>
                    <Input placeholder="Mihai Ionescu" value={values.partnerTwo ?? ""} onChange={set("partnerTwo")} />
                  </Field>
                  <Field label="Titlul evenimentului" hint="Apare în toată aplicația" className="sm:col-span-2">
                    <Input placeholder="Ana & Mihai" value={values.title ?? ""} onChange={set("title")} />
                  </Field>
                  <Field label="Cum vă numim în interfață?" className="sm:col-span-2">
                    <Input placeholder="Ana și Mihai" value={values.preferred ?? ""} onChange={set("preferred")} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Numele evenimentului" required className="sm:col-span-2">
                    <Input placeholder="Summit Sarbato 2027" value={values.title ?? ""} onChange={set("title")} />
                  </Field>
                  <Field label="Organizator / persoană de contact" required className="sm:col-span-2">
                    <Input placeholder="Andrei Popescu" value={values.organizerName ?? ""} onChange={set("organizerName")} />
                  </Field>
                </>
              )}
              {isWedding ? <div className="sm:col-span-2">
                <p className="text-[13px] font-medium text-ink">Fotografii de profil (opțional)</p>
                <div className="mt-2 flex gap-3">
                  {profilePhotoSlots.map((slot) => {
                    const selected = profilePhotos[slot.id];
                    const objectId = selected?.objectId || values[slot.valueKey];
                    const source =
                      selected?.previewUrl ||
                      (workspaceId && objectId
                        ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invitation-media/${encodeURIComponent(objectId)}`
                        : "");
                    const uploading = uploadingProfilePhoto === slot.id;
                    return (
                      <div key={slot.id}>
                        <input
                          ref={(node) => {
                            profilePhotoInputs.current[slot.id] = node;
                          }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          aria-label={`Selectează fotografia pentru ${slot.label}`}
                          className="sr-only"
                          onChange={(event) => {
                            selectProfilePhoto(slot.id, event.target.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => profilePhotoInputs.current[slot.id]?.click()}
                          disabled={saving || uploading}
                          aria-label={`${source ? "Schimbă" : "Adaugă"} fotografia pentru ${slot.label}`}
                          className="group relative flex size-24 overflow-hidden rounded-xl border border-dashed border-line-strong bg-surface text-faint transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25 disabled:cursor-wait disabled:opacity-70"
                        >
                          {source ? (
                            <Image
                              src={source}
                              alt={`Fotografie ${slot.label}`}
                              fill
                              unoptimized
                              sizes="96px"
                              className="object-cover"
                            />
                          ) : (
                            <span className="m-auto flex flex-col items-center gap-1.5">
                              <Camera className="size-5" aria-hidden />
                              <span className="text-[11px] font-medium">{slot.label}</span>
                            </span>
                          )}
                          {source && !uploading && (
                            <span className="absolute inset-x-0 bottom-0 bg-ink/75 px-1.5 py-1 text-[10px] font-medium text-white">
                              Schimbă
                            </span>
                          )}
                          {uploading && (
                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-surface/90 text-brand" role="status">
                              <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden />
                              <span className="text-[10px] font-medium">Se încarcă</span>
                            </span>
                          )}
                        </button>
                        {source && (
                          <p className="mt-1.5 text-center text-[10px] text-faint">
                            {selected?.file ? "Pregătită" : "Salvată"}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-faint">JPG, PNG sau WebP, maximum 10 MB.</p>
              </div> : null}
            </div>
          )}

          {/* ---------------- Step 2: Date & events ---------------- */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Data evenimentului">
                  <Input type="date" value={values.date ?? ""} onChange={set("date")} />
                </Field>
                <Field label="Date alternative">
                  <Input placeholder="ex. 5 sau 19 septembrie 2027" value={values.altDates ?? ""} onChange={set("altDates")} />
                </Field>
              </div>
              <Switch checked={toggles.flexibleDate} onCheckedChange={toggle("flexibleDate")} label="Suntem flexibili cu data" description="Copilotul poate propune date cu prețuri mai bune la furnizori." />
              <div>
                <p className="text-[13px] font-medium text-ink">Ce momente include evenimentul?</p>
                {isWedding ? (
                  <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Switch checked={toggles.civil} onCheckedChange={toggle("civil")} label="Cununie civilă" />
                    <Switch checked={toggles.religious} onCheckedChange={toggle("religious")} label="Cununie religioasă" />
                    <Switch checked={toggles.reception} onCheckedChange={toggle("reception")} label="Petrecere / recepție" />
                    <Switch checked={toggles.welcomeDinner} onCheckedChange={toggle("welcomeDinner")} label="Cină de bun venit" />
                    <Switch checked={toggles.brunch} onCheckedChange={toggle("brunch")} label="Brunch a doua zi" />
                  </div>
                ) : (
                  <div className="mt-2.5 rounded-xl border border-line bg-surface p-4">
                    <Field label="Momentul principal">
                      <Input
                        placeholder={eventTypeLabel(values.eventType)}
                        value={values.primaryTitle ?? ""}
                        onChange={set("primaryTitle")}
                      />
                    </Field>
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  {extraEvents.map((ev, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm text-ink">
                      <CalendarHeart className="size-4 text-accent" aria-hidden />
                      <Input
                        aria-label={`Numele momentului ${i + 1}`}
                        className="h-8 flex-1 border-0 bg-transparent px-1 shadow-none"
                        value={ev}
                        onChange={(event) =>
                          setExtraEvents((current) =>
                            current.map((item, index) =>
                              index === i ? event.target.value : item,
                            ),
                          )
                        }
                      />
                      <button type="button" onClick={() => setExtraEvents((prev) => prev.filter((_, idx) => idx !== i))} className="cursor-pointer text-faint hover:text-danger" aria-label={`Elimină momentul ${i + 1}`}>×</button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setExtraEvents((prev) => [...prev, `Moment personalizat ${prev.length + 1}`])}>
                    <Plus className="size-3.5" aria-hidden />
                    Adaugă alt eveniment
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- Step 3: Location ---------------- */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Țară">
                  <Select value={values.country ?? ""} onChange={set("country")}>
                    <option value="" disabled>Alege țara</option>
                    <option>România</option>
                    <option>Republica Moldova</option>
                    <option>Italia</option>
                    <option>Grecia</option>
                    <option>Portugalia</option>
                    <option>Altă țară</option>
                  </Select>
                </Field>
                <Field label="Județ / regiune">
                  <Input placeholder="Chișinău, Brașov, Cluj…" value={values.region ?? ""} onChange={set("region")} />
                </Field>
                <Field label="Oraș">
                  <Input placeholder="Brașov" value={values.city ?? ""} onChange={set("city")} />
                </Field>
              </div>
              <Switch checked={toggles.venueSelected} onCheckedChange={toggle("venueSelected")} label="Avem deja locația aleasă" />
              {toggles.venueSelected && (
                <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
                  <Field label="Numele locației">
                    <Input placeholder="Conacul Ambient" value={values.venue ?? ""} onChange={set("venue")} />
                  </Field>
                  <Field label="Adresa">
                    <Input placeholder="Cristian, jud. Brașov" value={values.venueAddress ?? ""} onChange={set("venueAddress")} />
                  </Field>
                </div>
              )}
              <Field label="Cât de flexibili sunteți cu locația?">
                <Select value={values.locationFlex ?? "fix"} onChange={set("locationFlex")}>
                  <option value="fix">Fixă: nu ne schimbăm</option>
                  <option value="open">Deschiși la sugestii în zonă</option>
                  <option value="searching">Încă căutăm</option>
                </Select>
              </Field>
              <Switch checked={toggles.destination} onCheckedChange={toggle("destination")} label="Eveniment la destinație" description="Majoritatea invitaților vor călători și pot avea nevoie de cazare." />
            </div>
          )}

          {/* ---------------- Step 4: Guests ---------------- */}
          {step === 4 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Invitați estimați (total)" required>
                <Input inputMode="numeric" placeholder="160" value={values.guestCount ?? ""} onChange={set("guestCount")} />
              </Field>
              <Field label="Adulți">
                <Input inputMode="numeric" placeholder="142" value={values.adults ?? ""} onChange={set("adults")} />
              </Field>
              <Field label="Copii">
                <Input inputMode="numeric" placeholder="18" value={values.children ?? ""} onChange={set("children")} />
              </Field>
              <Field label="Invitați locali">
                <Input inputMode="numeric" placeholder="90" value={values.local ?? ""} onChange={set("local")} />
              </Field>
              <Field label="Necesită transport">
                <Input inputMode="numeric" placeholder="46" value={values.transport ?? ""} onChange={set("transport")} />
              </Field>
              <Field label="Necesită cazare">
                <Input inputMode="numeric" placeholder="58" value={values.accommodation ?? ""} onChange={set("accommodation")} />
              </Field>
              <p className="col-span-full text-[13px] text-faint">
                Estimările pot fi ajustate oricând. Ele calibrează calculatoarele și recomandările Copilotului.
              </p>
            </div>
          )}

          {/* ---------------- Step 5: Budget ---------------- */}
          {step === 5 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Buget țintă" required>
                  <CurrencyInput placeholder="180000" value={values.budget ?? ""} onChange={set("budget")} />
                </Field>
                <Field label="Monedă">
                  <Select value={values.currency} onChange={set("currency")}>
                    <option value="RON">RON (leu românesc)</option>
                    <option value="EUR">EUR (euro)</option>
                  </Select>
                </Field>
              </div>
              <Field label="Cât de flexibil este bugetul?">
                <Select value={values.flexibility} onChange={set("flexibility")}>
                  <option value="strict">Strict: nu depășim</option>
                  <option value="moderat">Moderat: +5–10% pentru ce contează</option>
                  <option value="flexibil">Flexibil: prioritizăm experiența</option>
                </Select>
              </Field>
              <Field label="Cine contribuie?">
                <Select value={values.contributors ?? "noi"} onChange={set("contributors")}>
                  <option value="noi">Organizatorul</option>
                  <option value="familii">Organizatorul și familia</option>
                  <option value="families">Mai mulți contributori</option>
                </Select>
              </Field>
              <div>
                <p className="text-[13px] font-medium text-ink">Prioritățile voastre de cheltuială <span className="font-normal text-faint">(alege până la 3)</span></p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {priorities.map((p) => {
                    const active = selectedPriorities.includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() =>
                          setSelectedPriorities((prev) =>
                            active ? prev.filter((x) => x !== p) : prev.length < 3 ? [...prev, p] : prev,
                          )
                        }
                        className={cn(
                          "cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                          active ? "border-brand bg-brand-soft text-brand-strong dark:text-brand" : "border-line bg-surface text-muted hover:border-line-strong",
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ---------------- Step 6: Style ---------------- */}
          {step === 6 && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {styleOptions.map((s) => {
                  const active = styles.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStyles((prev) => (active ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                      aria-pressed={active}
                      className={cn(
                        "flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-4 transition-[border-color,background-color,box-shadow,color]",
                        active ? "border-brand bg-brand-soft shadow-card dark:bg-brand-softer" : "border-line bg-surface hover:border-line-strong",
                      )}
                    >
                      <s.icon className={cn("size-6", active ? "text-brand-strong dark:text-brand" : "text-faint")} aria-hidden />
                      <span className={cn("text-[13px] font-medium", active ? "text-brand-strong dark:text-brand" : "text-muted")}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nivel de formalitate">
                  <Select value={values.formality ?? "semi-formal"} onChange={set("formality")}>
                    <option value="casual">Relaxat / casual</option>
                    <option value="semi-formal">Semi-formal</option>
                    <option value="formal">Formal / black tie</option>
                  </Select>
                </Field>
                <Field label="Culori preferate">
                  <Input placeholder="ex. verde salvie, ivoriu, cupru" value={values.colors ?? ""} onChange={set("colors")} />
                </Field>
                <Field label="Ce stiluri evitați?" className="sm:col-span-2">
                  <Input placeholder="ex. foarte pompos, rustic exagerat" value={values.avoid ?? ""} onChange={set("avoid")} />
                </Field>
              </div>
              <Button variant="outline" disabled title="Disponibil după integrarea storage securizat">
                <ImagePlus className="size-4" aria-hidden />
                Încarcă imagini de inspirație
              </Button>
            </div>
          )}

          {/* ---------------- Step 7: Progress ---------------- */}
          {step === 7 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Bifează ce ați rezolvat deja. Copilotul nu vă va mai sugera acești pași.</p>
              {[
                ["venue", "Locația este rezervată"],
                ["photo", "Fotograful este contractat"],
                ["video", "Videograful este contractat"],
                ["music", "Muzica / DJ-ul este ales"],
                ["planner", "Avem un coordonator de eveniment"],
                ["catering", "Cateringul este selectat"],
                ["invitations", "Invitațiile sunt create"],
                ["guestlist", "Lista de invitați este începută"],
              ].map(([key, label]) => (
                <div key={key} className="rounded-xl border border-line bg-surface px-4 py-3">
                  <Switch
                    checked={!!progress[key]}
                    onCheckedChange={(c) => setProgress((p) => ({ ...p, [key]: c }))}
                    label={label}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ---------------- Step 8: Preferences ---------------- */}
          {step === 8 && (
            <div className="space-y-5">
              <Field label="Cât de proactiv să fie Copilotul AI?">
                <Select value={values.aiLevel} onChange={set("aiLevel")}>
                  <option value="minimal">Minimal: doar când îl întreb</option>
                  <option value="echilibrat">Echilibrat: sugestii relevante</option>
                  <option value="proactiv">Proactiv: planifică și anticipează</option>
                </Select>
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Frecvența notificărilor">
                  <Select value={values.notifFreq} onChange={set("notifFreq")}>
                    <option value="zilnic">Zilnic</option>
                    <option value="saptamanal">Rezumat săptămânal</option>
                    <option value="important">Doar ce e important</option>
                  </Select>
                </Field>
                <Field label="Timp disponibil săptămânal">
                  <Select value={values.weeklyTime} onChange={set("weeklyTime")}>
                    <option value="1-3">1–3 ore</option>
                    <option value="3-5">3–5 ore</option>
                    <option value="5+">Peste 5 ore</option>
                  </Select>
                </Field>
              </div>
              <Field label="Cine vă ajută la planificare?">
                <Input placeholder="ex. echipa internă, familia, un coordonator" value={values.helpers ?? ""} onChange={set("helpers")} />
              </Field>
              <Field label="Cea mai mare grijă acum">
                <Select value={values.concern ?? "buget"} onChange={set("concern")}>
                  <option value="buget">Să nu depășim bugetul</option>
                  <option value="timp">Să ne încadrăm în timp</option>
                  <option value="furnizori">Să găsim furnizori buni</option>
                  <option value="invitati">Organizarea invitaților</option>
                  <option value="ziua">Coordonarea zilei evenimentului</option>
                </Select>
              </Field>
            </div>
          )}
        </div>
      </main>

      {/* Footer nav */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-elevated/95 backdrop-blur-md">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:py-3.5">
          <Button className="w-full sm:w-auto" variant="ghost" onClick={() => void advance(Math.max(1, step - 1))} disabled={step === 1 || saving}>
            <ArrowLeft className="size-4" aria-hidden />
            Înapoi
          </Button>
          <div className="contents sm:ml-auto sm:flex sm:items-center sm:gap-2">
            {canSkip && (
              <Button className="w-full sm:w-auto" variant="ghost" onClick={() => void advance()} disabled={saving}>
                Omite
              </Button>
            )}
            {step < steps.length ? (
              <Button className={cn("w-full sm:w-auto", canSkip && "col-span-2")} onClick={() => void advance()} disabled={!canContinue || saving}>
                Continuă
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <>
                <Button className="w-full sm:w-auto" variant="outline" onClick={() => toast({ title: "Rezumat configurare", description: `${values.title || eventTypeLabel(values.eventType)} · ${values.date || "data nealeasă"} · ${values.guestCount || 0} invitați · ${formatRON(Number(values.budget) || 0)}`, variant: "info" })}>
                  Verifică detaliile
                </Button>
                <Button className="col-span-2 w-full sm:w-auto" onClick={() => void complete()} disabled={saving}>
                  <Save className="size-4" aria-hidden />
                  {saving ? "Se salvează…" : "Salvează și creează planul"}
                </Button>
                <span className="sr-only">După salvare, vei vedea și vei putea verifica propunerea planului.</span>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function booleanRecord(value: Record<string, unknown>): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
  );
}

function sectionForStep(
  step: number,
  values: Record<string, string>,
  toggles: Record<string, boolean>,
  styles: string[],
  priorities: string[],
  progress: Record<string, boolean>,
  extraEvents: string[],
): UpdateOnboardingDraft {
  const pick = (...keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, values[key] ?? ""]));
  if (step === 1) return { couple: { confirmed: true, ...pick("eventType", "organizerName", "partnerOne", "partnerTwo", "title", "preferred", "partnerOnePhotoId", "partnerTwoPhotoId") } };
  if (step === 2) return { dateEvents: { confirmed: true, ...pick("eventType", "date", "altDates", "primaryTitle"), civil: toggles.civil, religious: toggles.religious, reception: toggles.reception, welcomeDinner: toggles.welcomeDinner, brunch: toggles.brunch, flexibleDate: toggles.flexibleDate, extraEvents: extraEvents.filter((item) => item.trim()).map((item) => item.trim()) } };
  if (step === 3) return { location: { confirmed: true, ...pick("country", "region", "city", "venue", "venueAddress", "locationFlex"), venueSelected: toggles.venueSelected, destination: toggles.destination } };
  if (step === 4) return { guests: { confirmed: true, ...pick("guestCount", "adults", "children", "local", "transport", "accommodation") } };
  if (step === 5) return { budget: { confirmed: true, ...pick("budget", "currency", "flexibility", "contributors"), priorities } };
  if (step === 6) return { style: { confirmed: true, ...pick("formality", "colors", "avoid"), styles } };
  if (step === 7) return { existingProgress: { confirmed: true, ...progress } };
  return { planningPreferences: { confirmed: true, ...pick("aiLevel", "notifFreq", "weeklyTime", "helpers", "concern") } };
}
