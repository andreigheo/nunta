"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bell,
  ChevronRight,
  CreditCard,
  Download,
  KeyRound,
  Laptop,
  LockKeyhole,
  Mail,
  Palette,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";
import { formatDateLong } from "@/lib/utils";
import { ThemeSegmentedControl, useTheme } from "@/lib/theme";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardSkeleton,
  CardTitle,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  Select,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@/components/ui";
import {
  PUBLIC_AGGREGATE_POLICY_VERSION,
  type PublicAggregateConsent,
  type SessionSummary,
} from "@weddingos/contracts";
import type {
  WorkspaceBillingOverview,
  WorkspaceSubscriptionPlanKey,
} from "@weddingos/contracts";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { loadPaddle } from "@/lib/paddle";

type SettingsTab =
  | "general"
  | "notifications"
  | "billing"
  | "appearance"
  | "privacy"
  | "security";

const settingsTabs: Array<{ value: SettingsTab; label: string; icon: React.ElementType }> = [
  { value: "general", label: "General", icon: Settings2 },
  { value: "notifications", label: "Notificări", icon: Bell },
  { value: "billing", label: "Abonament", icon: CreditCard },
  { value: "appearance", label: "Aspect", icon: Palette },
  { value: "privacy", label: "Confidențialitate", icon: ShieldCheck },
  { value: "security", label: "Securitate", icon: LockKeyhole },
];

function normalizeTab(
  value: string | null,
  tabs = settingsTabs,
): SettingsTab {
  return tabs.some((tab) => tab.value === value)
    ? (value as SettingsTab)
    : "general";
}

export default function SettingsPage() {
  return (
    <React.Suspense fallback={<SettingsFallback />}>
      <SettingsContent />
    </React.Suspense>
  );
}

function SettingsFallback() {
  return (
    <div className="mx-auto max-w-6xl space-y-5" role="status" aria-busy="true" aria-label="Se încarcă setările">
      <PageHeader title="Setări" description="Configurează spațiul de lucru și preferințele contului." />
      <div className="h-10 w-full max-w-2xl animate-pulse rounded-xl bg-subtle" />
      <CardSkeleton lines={5} />
    </div>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const { bootstrap, currentWorkspace } = useWorkspace();
  const canManagePublicAggregation =
    bootstrap?.membership.capabilities.includes(
      "workspace.manage_public_aggregation",
    ) ?? false;
  const visibleTabs = currentWorkspace
    ? settingsTabs
    : settingsTabs.filter((item) => item.value !== "billing");
  const tab = normalizeTab(searchParams.get("tab"), visibleTabs);

  const changeTab = (next: string) => {
    const safeTab = normalizeTab(next, visibleTabs);
    const params = new URLSearchParams(window.location.search);
    if (safeTab === "general") params.delete("tab");
    else params.set("tab", safeTab);
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {currentWorkspace ? (
        <PageHeader title="Setări" description="Configurează spațiul de lucru și preferințele contului." />
      ) : null}

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {visibleTabs.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon className="size-3.5" aria-hidden />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general" className="mt-5">
          <GeneralSettings />
        </TabsContent>
        <TabsContent value="notifications" className="mt-5">
          <NotificationSettings />
        </TabsContent>
        <TabsContent value="billing" className="mt-5">
          <BillingSettings />
        </TabsContent>
        <TabsContent value="appearance" className="mt-5">
          <AppearanceSettings />
        </TabsContent>
        <TabsContent value="privacy" className="mt-5 space-y-5">
          <PersonalPrivacySettings />
          {canManagePublicAggregation && <AggregatePrivacySettings />}
        </TabsContent>
        <TabsContent value="security" className="mt-5">
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralSettings() {
  const { toast } = useToast();
  const { user, currentWorkspace, bootstrap, demoMode, refresh } = useWorkspace();
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [workspaceName, setWorkspaceName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [weddingDate, setWeddingDate] = React.useState("");
  const [currency, setCurrency] = React.useState("RON");
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [workspacePrivacyAction, setWorkspacePrivacyAction] = React.useState<
    "export" | "delete" | null
  >(null);
  const canDeleteWorkspace =
    bootstrap?.membership.capabilities.includes("workspace.delete") ?? false;

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setFirstName(user?.user.firstName ?? "");
      setLastName(user?.user.lastName ?? "");
      setEmail(user?.user.email ?? "");
      setWorkspaceName(currentWorkspace?.title ?? "");
      setCity(currentWorkspace?.location ?? "");
      setWeddingDate(currentWorkspace?.weddingDate ?? "");
      setCurrency(bootstrap?.workspace.currency ?? "RON");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [bootstrap, currentWorkspace, user]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (demoMode) {
      toast({ title: "Mod demo", description: "Modificarea rămâne izolată și nu este persistentă.", variant: "info" });
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      const operations: Array<Promise<unknown>> = [
        weddingOsApi.updateProfile(firstName, lastName),
      ];
      if (currentWorkspace && bootstrap) {
        operations.push(
          weddingOsApi.updateWorkspace(currentWorkspace.id, {
            title: workspaceName,
            location: city || null,
            weddingDate: weddingDate || null,
            currency,
            version: bootstrap.workspace.version,
          }),
        );
      }
      await Promise.all(operations);
      await refresh();
      toast({ title: "Setări salvate", description: "Profilul și spațiul de lucru au fost actualizate.", variant: "success" });
    } catch (error) {
      toast({ title: "Setările nu au fost salvate", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const requestWorkspaceExport = async () => {
    if (!currentWorkspace || demoMode) return;
    setWorkspacePrivacyAction("export");
    try {
      await weddingOsApi.requestWorkspaceDataExport(currentWorkspace.id);
      toast({
        title: "Cererea de export a fost înregistrată",
        description:
          "Datele spațiului vor fi pregătite într-un artefact securizat după verificare.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Cererea de export nu a fost înregistrată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setWorkspacePrivacyAction(null);
    }
  };

  const requestWorkspaceDeletion = async () => {
    if (!currentWorkspace || demoMode || !canDeleteWorkspace) return;
    setWorkspacePrivacyAction("delete");
    try {
      await weddingOsApi.requestWorkspaceDeletion(
        currentWorkspace.id,
        "Solicitată de proprietar din setările spațiului de lucru.",
      );
      setDeleteOpen(false);
      toast({
        title: "Cererea de ștergere a fost înregistrată",
        description:
          "Spațiul nu este șters instantaneu. Cererea intră în perioada de grație și verificarea obligațiilor de retenție.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Cererea de ștergere nu a fost înregistrată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setWorkspacePrivacyAction(null);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2"><UserRound className="size-4.5 text-brand" aria-hidden />Profil</CardTitle>
              <CardDescription>Informațiile afișate colegilor și furnizorilor.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prenume" htmlFor="settings-first-name">
                <Input id="settings-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required />
              </Field>
              <Field label="Nume" htmlFor="settings-last-name">
                <Input id="settings-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required />
              </Field>
            </div>
            <Field label="E-mail" htmlFor="settings-email" hint="Folosim această adresă pentru alertele importante.">
              <Input id="settings-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" readOnly />
            </Field>
          </CardContent>
        </Card>

        {currentWorkspace ? <Card>
          <CardHeader>
            <div>
              <CardTitle>Spațiu de lucru</CardTitle>
              <CardDescription>Detalii comune folosite în plan și documente.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Numele spațiului" htmlFor="settings-workspace">
              <Input id="settings-workspace" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required />
            </Field>
            <Field label="Oraș" htmlFor="settings-city">
              <Input id="settings-city" value={city} onChange={(event) => setCity(event.target.value)} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data evenimentului">
                <Input value={weddingDate} onChange={(event) => setWeddingDate(event.target.value)} type="date" aria-label="Data evenimentului" />
              </Field>
              <Field label="Monedă">
                <Select value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label="Monedă">
                  <option value="RON">RON — leu</option>
                  <option value="EUR">EUR — euro</option>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card> : null}

        <div className="lg:col-span-2">
          <Button type="submit" loading={saving}>Salvează modificările</Button>
        </div>
      </form>

      {currentWorkspace && canDeleteWorkspace ? <Card className="border-danger/30">
        <CardHeader>
          <div>
            <CardTitle>Zonă sensibilă</CardTitle>
            <CardDescription>Aceste acțiuni afectează întregul spațiu de lucru.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Șterge spațiul de lucru</p>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted">Solicită întâi exportul. Ștergerea are perioadă de grație, verifică retenția legală și elimină proiectul pentru toți membrii echipei.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={workspacePrivacyAction === "export"}
              disabled={demoMode || workspacePrivacyAction !== null}
              onClick={() => void requestWorkspaceExport()}
            >
              <Download className="size-3.5" aria-hidden />Solicită exportul
            </Button>
            <Button
              variant="destructive-outline"
              size="sm"
              disabled={demoMode || workspacePrivacyAction !== null}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" aria-hidden />Solicită ștergerea
            </Button>
          </div>
        </CardContent>
      </Card> : null}

      {currentWorkspace && canDeleteWorkspace ? <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void requestWorkspaceDeletion()}
        title="Soliciți ștergerea spațiului?"
        description="Cererea nu șterge instantaneu datele. Intră într-o perioadă de grație, este verificată pentru contracte și retenție legală, apoi elimină datele private eligibile."
        confirmLabel="Trimite cererea"
        requireTypedConfirmation="ȘTERGE"
        destructive
        loading={workspacePrivacyAction === "delete"}
      /> : null}
    </div>
  );
}

type NotificationKey = "tasks" | "payments" | "rsvp" | "vendors" | "digest" | "marketing";

function NotificationSettings() {
  const { toast } = useToast();
  const { demoMode } = useWorkspace();
  const [saving, setSaving] = React.useState(false);
  const [preferences, setPreferences] = React.useState<Record<NotificationKey, boolean>>({
    tasks: true,
    payments: true,
    rsvp: true,
    vendors: true,
    digest: true,
    marketing: false,
  });

  const toggle = (key: NotificationKey) => (checked: boolean) => {
    setPreferences((current) => ({ ...current, [key]: checked }));
  };

  React.useEffect(() => {
    if (demoMode) return;
    weddingOsApi
      .notificationPreference()
      .then((preference) =>
        setPreferences({
          tasks: preference.tasksEmail,
          payments: preference.paymentsEmail,
          rsvp: preference.rsvpEmail,
          vendors: preference.vendorsEmail,
          digest: preference.digestEmail,
          marketing: preference.marketingEmail,
        }),
      )
      .catch((error) =>
        toast({ title: "Preferințele nu au fost încărcate", description: apiErrorMessage(error), variant: "error" }),
      );
  }, [demoMode, toast]);

  const saveNotifications = async () => {
    if (demoMode) {
      toast({ title: "Mod demo", description: "Preferințele rămân doar în sesiunea demo.", variant: "info" });
      return;
    }
    setSaving(true);
    try {
      await weddingOsApi.updateNotificationPreference({
        tasksEmail: preferences.tasks,
        paymentsEmail: preferences.payments,
        rsvpEmail: preferences.rsvp,
        vendorsEmail: preferences.vendors,
        digestEmail: preferences.digest,
        marketingEmail: preferences.marketing,
      });
      toast({ title: "Preferințe salvate", description: "Următoarele notificări vor respecta noile alegeri.", variant: "success" });
    } catch (error) {
      toast({ title: "Preferințele nu au fost salvate", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Notificări e-mail</CardTitle>
            <CardDescription>Alege ce merită să ajungă în inbox, pe lângă notificările din aplicație.</CardDescription>
          </div>
          <Mail className="size-5 text-faint" aria-hidden />
        </CardHeader>
        <CardContent className="divide-y divide-line">
          <NotificationSwitch checked={preferences.tasks} onChange={toggle("tasks")} label="Sarcini și termene" description="Sarcini atribuite, depășite sau blocate." />
          <NotificationSwitch checked={preferences.payments} onChange={toggle("payments")} label="Plăți și buget" description="Scadențe, plăți restante și depășiri de buget." />
          <NotificationSwitch checked={preferences.rsvp} onChange={toggle("rsvp")} label="RSVP și invitați" description="Confirmări noi, răspunsuri și cerințe speciale." />
          <NotificationSwitch checked={preferences.vendors} onChange={toggle("vendors")} label="Furnizori și oferte" description="Oferte noi, mesaje și expirarea condițiilor comerciale." />
          <NotificationSwitch checked={preferences.digest} onChange={toggle("digest")} label="Rezumat săptămânal" description="Progres, riscuri și următoarele priorități, în fiecare luni." />
          <NotificationSwitch checked={preferences.marketing} onChange={toggle("marketing")} label="Noutăți Sarbato" description="Funcții noi și ghiduri de planificare, cel mult lunar." />
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader><div><CardTitle>Liniște digitală</CardTitle><CardDescription>Amână alertele neurgente.</CardDescription></div></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Interval fără alerte" htmlFor="quiet-hours">
              <Select id="quiet-hours" defaultValue="22-08">
                <option value="off">Dezactivat</option>
                <option value="22-08">22:00 – 08:00</option>
                <option value="20-09">20:00 – 09:00</option>
              </Select>
            </Field>
            <p className="text-xs leading-relaxed text-faint">Plățile restante și riscurile critice rămân vizibile în aplicație.</p>
          </CardContent>
        </Card>
        <Button className="w-full" loading={saving} onClick={() => void saveNotifications()}>
          Salvează notificările
        </Button>
      </div>
    </div>
  );
}

function NotificationSwitch({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <Switch checked={checked} onCheckedChange={onChange} label={label} description={description} />
    </div>
  );
}

const entitlementRows = [
  { key: "MAX_GUESTS", label: "Invitați" },
  { key: "MAX_COLLABORATORS", label: "Colaboratori" },
  { key: "AI_ACTIONS_MONTHLY", label: "Acțiuni AI / lună" },
  { key: "MAX_ACTIVE_AUTOMATIONS", label: "Automatizări active" },
  { key: "STORAGE_BYTES", label: "Stocare" },
  { key: "ADVANCED_LOGISTICS", label: "Mese, transport și cazare" },
  { key: "VENDOR_COORDINATION", label: "Cereri, oferte și rezervări" },
  { key: "DOCUMENTS", label: "Documente operaționale" },
  { key: "RISK_AND_CONTINGENCY", label: "Riscuri și Plan B" },
  { key: "EVENT_DAY_OPERATIONS", label: "Comandament și check-in" },
  { key: "E_SIGNATURES", label: "Semnături prin furnizor extern" },
  { key: "PRIORITY_SUPPORT", label: "Suport prioritar" },
] as const;

const usageLabels: Record<string, string> = {
  MAX_GUESTS: "Invitați activi",
  MAX_COLLABORATORS: "Colaboratori și invitații",
  AI_ACTIONS_MONTHLY: "Acțiuni AI luna aceasta",
  MAX_ACTIVE_AUTOMATIONS: "Automatizări active",
  STORAGE_BYTES: "Stocare utilizată",
};

function formatBytes(value: number) {
  if (value < 1024 * 1024 * 1024)
    return `${Math.round(value / 1024 / 1024)} MB`;
  return `${Math.round((value / 1024 / 1024 / 1024) * 10) / 10} GB`;
}

function formatEntitlement(key: string, value: boolean | number | undefined) {
  if (typeof value === "boolean") return value ? "Inclus" : "—";
  if (typeof value !== "number") return "—";
  if (key === "STORAGE_BYTES") return formatBytes(value);
  return value.toLocaleString("ro-RO");
}

function BillingSettings() {
  const { currentWorkspace, bootstrap } = useWorkspace();
  const { toast } = useToast();
  const [billing, setBilling] = React.useState<
    | (WorkspaceBillingOverview & {
        clientToken: string | null;
        paddleEnvironment: "sandbox" | "production";
      })
    | null
  >(null);
  const [loading, setLoading] = React.useState(true);
  const [busyPlan, setBusyPlan] =
    React.useState<WorkspaceSubscriptionPlanKey | null>(null);
  const canManage =
    bootstrap?.membership.capabilities.includes("workspace.billing.manage") ??
    false;

  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      setBilling(await weddingOsApi.workspaceBilling(currentWorkspace.id));
    } catch (error) {
      toast({
        title: "Abonamentul nu a putut fi încărcat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, toast]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const choosePlan = async (plan: WorkspaceSubscriptionPlanKey) => {
    if (!currentWorkspace || !billing || !canManage) return;
    setBusyPlan(plan);
    try {
      const result =
        plan === "FREE" && billing.portalAvailable
          ? await weddingOsApi.workspaceBillingPortal(currentWorkspace.id)
          : plan === "FREE"
            ? null
            : await weddingOsApi.startWorkspaceCheckout(
                currentWorkspace.id,
                plan,
              );
      if (
        result &&
        "mode" in result &&
        result.mode === "checkout" &&
        "transactionId" in result &&
        typeof result.transactionId === "string" &&
        billing.clientToken
      ) {
        const paddle = await loadPaddle(
          billing.clientToken,
          billing.paddleEnvironment,
        );
        paddle.Checkout.open({
          transactionId: result.transactionId,
          settings: {
            displayMode: "overlay",
            theme: "light",
            successUrl: `${window.location.origin}/settings?tab=billing&checkout=success`,
          },
        });
      } else if (result) {
        window.location.assign(result.url);
      }
    } catch (error) {
      toast({
        title: "Planul nu a putut fi deschis",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusyPlan(null);
    }
  };

  if (loading) return <CardSkeleton lines={6} />;
  if (!billing)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Abonamentul nu este disponibil</CardTitle>
        </CardHeader>
        <CardContent>
          <Button size="sm" onClick={() => void load()}>
            Încearcă din nou
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-brand text-2xl font-semibold text-ink">
              Alege planul potrivit
            </h2>
            <p className="mt-1 text-sm text-muted">
              Prețuri lunare în EUR. Paddle procesează numai abonamentul
              Sarbato.
            </p>
          </div>
          <Badge variant="neutral">
            Plan curent:{" "}
            {billing.plans.find(
              (plan) => plan.key === billing.subscription.plan,
            )?.name ?? billing.subscription.plan}
          </Badge>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {billing.plans.map((plan) => {
            const current = plan.key === billing.subscription.plan;
            const disabled =
              !canManage ||
              current ||
              !billing.checkoutAvailable ||
              (plan.key === "FREE" && !billing.portalAvailable);
            return (
              <Card
                key={plan.key}
                className={
                  plan.recommended
                    ? "border-brand/40 shadow-[0_18px_50px_rgba(26,68,56,0.10)]"
                    : undefined
                }
              >
                <CardHeader>
                  <div className="w-full">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle>{plan.name}</CardTitle>
                      {plan.recommended && (
                        <Badge variant="success">Recomandat</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex items-end gap-1 text-ink">
                      <span className="text-4xl font-semibold">
                        €{(plan.amountMinor / 100).toFixed(0)}
                      </span>
                      <span className="pb-1 text-sm text-faint">/ lună</span>
                    </div>
                    <CardDescription className="mt-2">
                      {plan.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex h-full flex-col">
                  <ul className="space-y-2 text-sm text-muted">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <ShieldCheck
                          className="mt-0.5 size-4 shrink-0 text-brand"
                          aria-hidden
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-6 w-full"
                    variant={plan.recommended ? "primary" : "outline"}
                    disabled={disabled}
                    loading={busyPlan === plan.key}
                    onClick={() => void choosePlan(plan.key)}
                  >
                    {current
                      ? "Planul tău"
                      : plan.key === "FREE"
                        ? "Treci la Gratuit"
                        : billing.portalAvailable
                          ? "Schimbă planul"
                          : `Alege ${plan.name}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Utilizarea planului curent</CardTitle>
            <CardDescription>
              Limitele sunt calculate server-side pentru întregul workspace, nu
              separat pe fiecare membru.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {Object.entries(billing.usage).map(([key, metric]) => {
              const percent =
                metric.limit > 0
                  ? Math.min(100, Math.round((metric.used / metric.limit) * 100))
                  : metric.used > 0
                    ? 100
                    : 0;
              const formattedUsed =
                key === "STORAGE_BYTES"
                  ? formatBytes(metric.used)
                  : metric.used.toLocaleString("ro-RO");
              const formattedLimit =
                key === "STORAGE_BYTES"
                  ? formatBytes(metric.limit)
                  : metric.limit.toLocaleString("ro-RO");
              return (
                <div key={key} className="rounded-xl border border-line p-3">
                  <p className="text-xs font-medium text-muted">
                    {usageLabels[key] ?? key}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-ink tabular-nums">
                    {formattedUsed}
                    <span className="text-xs font-normal text-faint">
                      {" "}
                      / {formattedLimit}
                    </span>
                  </p>
                  <div
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle"
                    role="progressbar"
                    aria-label={usageLabels[key] ?? key}
                    aria-valuemin={0}
                    aria-valuemax={metric.limit}
                    aria-valuenow={Math.min(metric.used, metric.limit)}
                  >
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Comparație completă</CardTitle>
            <CardDescription>
              Citirea datelor existente rămâne disponibilă după downgrade;
              planul controlează acțiunile noi și limitele.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-3 py-3 font-semibold text-ink">Funcție</th>
                {billing.plans.map((plan) => (
                  <th
                    key={plan.key}
                    className="px-3 py-3 text-center font-semibold text-ink"
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entitlementRows.map((row) => (
                <tr key={row.key} className="border-b border-line last:border-0">
                  <th className="px-3 py-3 font-medium text-muted">
                    {row.label}
                  </th>
                  {billing.plans.map((plan) => (
                    <td
                      key={plan.key}
                      className="px-3 py-3 text-center text-muted"
                    >
                      {formatEntitlement(
                        row.key,
                        plan.entitlements[row.key],
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Acces pe tip de utilizator</CardTitle>
            <CardDescription>
              Accesul efectiv este intersecția dintre rolul membrului și
              funcțiile planului workspace-ului.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {billing.rolePolicy.map((policy) => {
              const current =
                bootstrap?.membership.roleTemplate === policy.role;
              return (
                <div
                  key={policy.role}
                  className="rounded-xl border border-line bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{policy.name}</p>
                    {current ? <Badge variant="brand">Rolul tău</Badge> : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {policy.description}
                  </p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
                    Facturare:{" "}
                    {policy.billing === "manage"
                      ? "gestionare"
                      : policy.billing === "read"
                        ? "doar citire"
                        : "fără acces"}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-4.5 text-faint" aria-hidden />
              Facturi și metodă de plată
            </CardTitle>
            <CardDescription>
              Cardurile și facturile sunt administrate securizat în portalul
              Paddle.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {billing.transactions.length > 0 ? (
            <div className="mb-4 overflow-hidden rounded-xl border border-line">
              <div className="border-b border-line bg-subtle px-4 py-3">
                <p className="text-sm font-semibold text-ink">
                  Istoric facturare
                </p>
                <p className="mt-0.5 text-xs text-faint">
                  Confirmări contabile primite direct de la Paddle.
                </p>
              </div>
              <div className="divide-y divide-line">
                {billing.transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-5"
                  >
                    <div>
                      <p className="font-medium text-ink">
                        Sarbato {transaction.plan === "PRO" ? "Pro" : "Plus"}
                      </p>
                      <p className="mt-0.5 text-xs text-faint">
                        {transaction.invoiceNumber
                          ? `Factură ${transaction.invoiceNumber}`
                          : transaction.providerTransactionId}
                      </p>
                    </div>
                    <p className="text-xs text-muted sm:text-sm">
                      {transaction.completedAt
                        ? new Intl.DateTimeFormat("ro-RO", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }).format(new Date(transaction.completedAt))
                        : "În curs"}
                    </p>
                    <p className="font-semibold text-ink tabular-nums sm:text-right">
                      {new Intl.NumberFormat("ro-RO", {
                        style: "currency",
                        currency: transaction.currency,
                      }).format(transaction.totalMinor / 100)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-subtle p-4">
            <div>
              <p className="text-sm font-medium text-ink">
                {billing.portalAvailable
                  ? "Portalul abonamentului este disponibil"
                  : "Nu există încă o metodă de plată asociată"}
              </p>
              <p className="mt-1 text-xs text-faint">
                Sarbato nu încasează și nu transferă plăți între organizatori
                și furnizori.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!canManage || !billing.portalAvailable}
              onClick={() => void choosePlan("FREE")}
            >
              Deschide portalul Paddle
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AppearanceSettings() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const { demoMode, user, refresh } = useWorkspace();
  const [density, setDensity] = React.useState("comfortable");
  const [language, setLanguage] = React.useState(user?.preferences.locale ?? "ro-RO");
  const [saving, setSaving] = React.useState(false);

  const saveAppearance = async () => {
    if (demoMode) {
      toast({ title: "Mod demo", description: "Aspectul rămâne local pe acest dispozitiv.", variant: "info" });
      return;
    }
    setSaving(true);
    try {
      await weddingOsApi.updatePreference({ locale: language, theme });
      await refresh();
      toast({ title: "Preferințe salvate", description: "Limba și tema au fost sincronizate cu contul.", variant: "success" });
    } catch (error) {
      toast({ title: "Preferințele nu au fost salvate", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><div><CardTitle>Temă vizuală</CardTitle><CardDescription>Alege aspectul potrivit pentru lumină și dispozitiv.</CardDescription></div></CardHeader>
        <CardContent>
          <ThemeSegmentedControl className="max-w-full overflow-x-auto" />
          <p className="mt-3 text-xs leading-relaxed text-faint">Opțiunea „Sistem” urmărește automat setarea dispozitivului.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Limbă și afișare</CardTitle><CardDescription>Preferințe locale pentru date și densitate.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Limbă" htmlFor="appearance-language"><Select id="appearance-language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="ro-RO">Română</option><option value="en-US" disabled>English — în curând</option></Select></Field>
          <Field label="Densitatea interfeței" htmlFor="appearance-density">
            <Select id="appearance-density" value={density} onChange={(event) => setDensity(event.target.value)}>
              <option value="comfortable">Confortabilă</option>
              <option value="compact">Compactă</option>
            </Select>
          </Field>
          <Button size="sm" loading={saving} onClick={() => void saveAppearance()}>Salvează aspectul</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PersonalPrivacySettings() {
  const { toast } = useToast();
  const { user, demoMode } = useWorkspace();
  const [privacy, setPrivacy] = React.useState<Awaited<ReturnType<typeof weddingOsApi.privacyOverview>> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<"export" | "delete" | "cookies" | null>(null);

  const load = React.useCallback(async () => {
    if (demoMode) {
      setLoading(false);
      return;
    }
    try {
      setPrivacy(await weddingOsApi.privacyOverview());
    } catch (error) {
      toast({ title: "Centrul de confidențialitate nu a fost încărcat", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [demoMode, toast]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateCookies = async (key: "preferences" | "analytics" | "marketing", checked: boolean) => {
    if (!privacy || demoMode) return;
    setBusy("cookies");
    try {
      await weddingOsApi.saveCookiePreferences({
        preferences: key === "preferences" ? checked : privacy.cookie.preferences,
        analytics: key === "analytics" ? checked : privacy.cookie.analytics,
        marketing: key === "marketing" ? checked : privacy.cookie.marketing,
      });
      await load();
      toast({ title: "Preferințele cookie au fost salvate", variant: "success" });
    } catch (error) {
      toast({ title: "Preferințele nu au fost salvate", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const requestExport = async () => {
    setBusy("export");
    try {
      await weddingOsApi.requestPersonalDataExport();
      await load();
      toast({ title: "Cerere de export înregistrată", description: "Datele vor fi pregătite într-un artefact securizat după verificare.", variant: "success" });
    } catch (error) {
      toast({ title: "Cererea nu a fost înregistrată", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const requestDeletion = async () => {
    if (!user) return;
    const reason = window.prompt("Descrie motivul cererii de ștergere (minimum 8 caractere):");
    if (!reason || reason.trim().length < 8) return;
    if (!window.confirm("Confirmi trimiterea cererii? Contul nu este șters instantaneu; cererea intră în verificare.")) return;
    setBusy("delete");
    try {
      await weddingOsApi.requestAccountDeletion(user.user.id, reason.trim());
      await load();
      toast({ title: "Cerere de ștergere înregistrată", description: "Cererea va fi verificată; anumite date pot fi păstrate pentru obligații contractuale, financiare, de securitate sau legale.", variant: "success" });
    } catch (error) {
      toast({ title: "Cererea nu a fost înregistrată", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <CardSkeleton lines={6} />;
  if (demoMode) return <Card><CardHeader><div><CardTitle>Privacy Center</CardTitle><CardDescription>Demo-ul nu citește și nu modifică date privacy reale.</CardDescription></div></CardHeader></Card>;
  if (!privacy) return <Card><CardContent className="p-5"><Button variant="outline" onClick={() => void load()}>Reîncarcă Privacy Center</Button></CardContent></Card>;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader><div><CardTitle>Privacy Center</CardTitle><CardDescription>Istoricul consimțămintelor, preferințele cookie și cererile privind datele tale.</CardDescription></div></CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg bg-subtle p-3 text-sm leading-relaxed text-muted">{privacy.retentionNotice}</div>
          <div className="space-y-4">
            <Switch checked={privacy.cookie.essential} disabled label="Cookie-uri esențiale" description="Necesare pentru autentificare, securitate și funcționarea platformei." />
            <Switch checked={privacy.cookie.preferences} disabled={busy === "cookies"} onCheckedChange={(value) => void updateCookies("preferences", value)} label="Preferințe" description="Păstrează setările opționale ale interfeței." />
            <Switch checked={privacy.cookie.analytics} disabled={busy === "cookies"} onCheckedChange={(value) => void updateCookies("analytics", value)} label="Analytics opțional" description="Dezactivat implicit; nu este încărcat fără acord." />
            <Switch checked={privacy.cookie.marketing} disabled={busy === "cookies"} onCheckedChange={(value) => void updateCookies("marketing", value)} label="Marketing opțional" description="Dezactivat implicit și poate fi retras oricând." />
          </div>
        </CardContent>
      </Card>
      <div className="space-y-5">
        <Card><CardHeader><div><CardTitle>Cererile tale</CardTitle><CardDescription>{privacy.requests.length} cereri privacy · {privacy.deletions.length} cereri de ștergere</CardDescription></div></CardHeader><CardContent className="space-y-2"><Button className="w-full" variant="outline" loading={busy === "export"} onClick={() => void requestExport()}><Download className="size-4" />Solicită exportul datelor</Button><Button className="w-full" variant="destructive-outline" loading={busy === "delete"} onClick={() => void requestDeletion()}><Trash2 className="size-4" />Solicită ștergerea contului</Button></CardContent></Card>
        <Card><CardHeader><div><CardTitle>Documente publice</CardTitle><CardDescription>Conținut provizoriu, versionat, care necesită review juridic înainte de lansarea publică.</CardDescription></div></CardHeader><CardContent className="space-y-2 text-sm"><a className="block text-brand hover:underline" href="/privacy">Politica de confidențialitate</a><a className="block text-brand hover:underline" href="/terms">Termeni de utilizare</a><a className="block text-brand hover:underline" href="/cookies">Politica cookie</a></CardContent></Card>
      </div>
    </div>
  );
}

function AggregatePrivacySettings() {
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [consent, setConsent] = React.useState<PublicAggregateConsent | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [pendingEnabled, setPendingEnabled] = React.useState<boolean | null>(
    null,
  );

  const canManage =
    bootstrap?.membership.capabilities.includes(
      "workspace.manage_public_aggregation",
    ) ?? false;

  const loadConsent = React.useCallback(async () => {
    if (!currentWorkspace || !canManage || demoMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setConsent(
        await weddingOsApi.publicAggregateConsent(currentWorkspace.id),
      );
    } catch (error) {
      toast({
        title: "Preferința de confidențialitate nu a fost încărcată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [canManage, currentWorkspace, demoMode, toast]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadConsent(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadConsent]);

  const saveConsent = async () => {
    if (
      pendingEnabled === null ||
      !currentWorkspace ||
      !consent ||
      demoMode
    ) {
      setPendingEnabled(null);
      return;
    }

    setSaving(true);
    try {
      const next = await weddingOsApi.updatePublicAggregateConsent(
        currentWorkspace.id,
        {
          enabled: pendingEnabled,
          policyVersion: PUBLIC_AGGREGATE_POLICY_VERSION,
        },
        consent.version,
      );
      setConsent(next);
      toast({
        title: pendingEnabled
          ? "Participarea a fost activată"
          : "Participarea a fost revocată",
        description: pendingEnabled
          ? "Doar statistici agregate eligibile vor putea contribui la dovada publică Sarbato."
          : "Datele acestui spațiu vor fi eliminate la următoarea recalculare, în cel mult 15 minute.",
        variant: pendingEnabled ? "success" : "info",
      });
      setPendingEnabled(null);
    } catch (error) {
      toast({
        title: "Preferința nu a fost salvată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <CardSkeleton lines={5} />;
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Confidențialitatea spațiului</CardTitle>
            <CardDescription>
              Numai proprietarul spațiului poate schimba această preferință.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (demoMode) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Date agregate pentru dovada publică</CardTitle>
            <CardDescription>
              Modul demo nu citește și nu modifică preferințe reale.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Switch
            checked={false}
            disabled
            label="Contribuie cu statistici agregate"
            description="Disponibil numai într-un spațiu de lucru real, cu acordul explicit al proprietarului."
          />
        </CardContent>
      </Card>
    );
  }

  if (!consent) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Preferința nu este disponibilă</CardTitle>
            <CardDescription>
              Reîncarcă starea înainte de a acorda sau revoca acordul.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => void loadConsent()}>
            Reîncarcă
          </Button>
        </CardContent>
      </Card>
    );
  }

  const changedAt = consent.enabled
    ? consent.consentedAt
    : consent.revokedAt;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={consent.enabled ? "success" : "neutral"} dot>
                {consent.enabled ? "Acord activ" : "Participare oprită"}
              </Badge>
              <span className="text-xs text-faint">
                Politica {consent.policyVersion}
              </span>
            </div>
            <CardTitle>Date agregate pentru dovada publică</CardTitle>
            <CardDescription>
              Participarea este oprită implicit și poate fi schimbată numai de
              proprietarul spațiului.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <Switch
            checked={consent.enabled}
            disabled={saving}
            onCheckedChange={(checked) => setPendingEnabled(checked)}
            label="Contribuie cu statistici agregate"
            description="Sarbato poate include doar procente rotunjite, după atingerea pragului minim de confidențialitate."
          />
          {changedAt && (
            <p className="text-xs text-faint">
              Ultima decizie: {formatDateLong(changedAt)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <div>
            <CardTitle>Ce poate deveni public</CardTitle>
            <CardDescription>
              Reguli aplicate înainte de publicarea oricărui snapshot.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm leading-relaxed text-muted">
            <li>Minimum 20 de spații eligibile pentru fiecare metrică.</li>
            <li>Procente rotunjite; cohortele sunt afișate numai aproximativ.</li>
            <li>Fără nume, contacte, locații, date exacte, texte sau sume.</li>
            <li>Fereastră de 365 de zile, recalculată la 15 minute.</li>
          </ul>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingEnabled !== null}
        onClose={() => setPendingEnabled(null)}
        onConfirm={() => void saveConsent()}
        loading={saving}
        destructive={pendingEnabled === false}
        title={
          pendingEnabled
            ? "Activezi contribuția agregată?"
            : "Revoci contribuția agregată?"
        }
        description={
          pendingEnabled
            ? "Acest acord permite folosirea statisticilor spațiului numai după agregare, rotunjire și verificarea cohortei minime. Nu sunt publicate date personale, texte sau valori financiare."
            : "Spațiul nu va mai contribui la snapshoturile viitoare. Eliminarea din agregatul public este programată imediat și se finalizează în cel mult 15 minute."
        }
        confirmLabel={pendingEnabled ? "Activează acordul" : "Revocă acordul"}
      />
    </div>
  );
}

function SecuritySettings() {
  const { toast } = useToast();
  const { user, demoMode } = useWorkspace();
  const [securityEmail, setSecurityEmail] = React.useState(true);
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(true);

  const loadSecurity = React.useCallback(async () => {
    if (demoMode) {
      setLoadingSessions(false);
      return;
    }
    try {
      const [nextSessions, preferences] = await Promise.all([
        weddingOsApi.sessions(),
        weddingOsApi.notificationPreference(),
      ]);
      setSessions(nextSessions);
      setSecurityEmail(preferences.securityEmail);
    } catch (error) {
      toast({ title: "Securitatea contului nu a fost încărcată", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setLoadingSessions(false);
    }
  }, [demoMode, toast]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadSecurity(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSecurity]);

  const changeSecurityEmail = async (checked: boolean) => {
    setSecurityEmail(checked);
    if (demoMode) return;
    try {
      await weddingOsApi.updateNotificationPreference({ securityEmail: checked });
    } catch (error) {
      setSecurityEmail(!checked);
      toast({ title: "Preferința nu a fost salvată", description: apiErrorMessage(error), variant: "error" });
    }
  };

  const requestPasswordChange = async () => {
    if (!user || demoMode) {
      toast({ title: "Mod demo", description: "Schimbarea parolei necesită un cont real.", variant: "info" });
      return;
    }
    try {
      await weddingOsApi.requestPasswordReset(user.user.email);
      toast({ title: "Link securizat trimis", description: "Verifică e-mailul pentru schimbarea parolei.", variant: "success" });
    } catch (error) {
      toast({ title: "Linkul nu a fost trimis", description: apiErrorMessage(error), variant: "error" });
    }
  };

  const revokeSession = async (session: SessionSummary) => {
    try {
      await weddingOsApi.revokeSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      toast({ title: "Sesiune închisă", description: session.userAgent ?? "Dispozitiv", variant: "success" });
    } catch (error) {
      toast({ title: "Sesiunea nu a fost închisă", description: apiErrorMessage(error), variant: "error" });
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <Card>
          <CardHeader><div><CardTitle className="flex items-center gap-2"><LockKeyhole className="size-4.5 text-brand" aria-hidden />Autentificare</CardTitle><CardDescription>Protejează accesul la datele evenimentului.</CardDescription></div></CardHeader>
          <CardContent className="divide-y divide-line">
            <div className="pb-4"><Switch checked={false} disabled label="Verificare în doi pași" description="Activarea pentru acest tip de cont nu este disponibilă încă." /></div>
            <div className="py-4"><Switch checked={securityEmail} onCheckedChange={(checked) => void changeSecurityEmail(checked)} label="Alerte de securitate prin e-mail" description="Primește alerte pentru autentificări și modificări sensibile." /></div>
            <div className="flex items-center justify-between gap-4 pt-4"><div><p className="text-sm font-medium text-ink">Parolă</p><p className="text-xs text-muted">Schimbarea parolei revocă toate sesiunile active</p></div><Button variant="outline" size="sm" onClick={() => void requestPasswordChange()}><KeyRound className="size-3.5" aria-hidden />Schimbă</Button></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Sesiuni active</CardTitle><CardDescription>Dispozitive conectate în ultimele 30 de zile.</CardDescription></div></CardHeader>
          <CardContent className="divide-y divide-line">
            {loadingSessions && <p className="py-4 text-sm text-muted">Se încarcă sesiunile…</p>}
            {!loadingSessions && sessions.length === 0 && <p className="py-4 text-sm text-muted">Nu există sesiuni active în afara modului demo.</p>}
            {sessions.map((session) => (
              <Session key={session.id} session={session} onRevoke={() => void revokeSession(session)} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader><div><CardTitle>Date și confidențialitate</CardTitle><CardDescription>Ai control asupra datelor contului.</CardDescription></div></CardHeader>
        <CardContent className="space-y-2">
          <Link href="/settings?tab=privacy" className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm text-muted transition-colors hover:bg-subtle hover:text-ink">
            <Download className="size-4 text-faint" aria-hidden /><span className="flex-1">Exportă datele contului</span><ChevronRight className="size-4 text-faint" aria-hidden />
          </Link>
          <button type="button" disabled title="Disponibil într-o etapă viitoare" className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm text-muted opacity-60">
            <ShieldCheck className="size-4 text-faint" aria-hidden /><span className="flex-1">Vezi jurnalul de acces</span><ChevronRight className="size-4 text-faint" aria-hidden />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function Session({ session, onRevoke }: { session: SessionSummary; onRevoke: () => void }) {
  const isMobile = /iphone|android|mobile/i.test(session.userAgent ?? "");
  const Icon = isMobile ? Smartphone : Laptop;
  const title = session.userAgent?.split(" ").slice(0, 4).join(" ") || "Dispozitiv necunoscut";
  const detail = `${session.ipAddress ?? "IP necunoscut"} · activ ${formatDateLong(session.lastSeenAt)}`;
  return (
    <div className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
      <span className="flex size-10 items-center justify-center rounded-xl bg-subtle text-muted"><Icon className="size-5" aria-hidden /></span>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium text-ink">{title}</p>{session.current && <Badge variant="success">Curentă</Badge>}</div><p className="text-xs text-faint">{detail}</p></div>
      {!session.current && <Button variant="ghost" size="sm" onClick={onRevoke}>Deconectează</Button>}
    </div>
  );
}
