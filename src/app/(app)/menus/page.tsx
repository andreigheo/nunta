"use client";

import Link from "next/link";
import * as React from "react";
import type { CreateMenu, MenuResource } from "@weddingos/contracts";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Info,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui";

type MenuSelection = {
  id: string;
  guestId: string;
  guestName: string;
  menuId: string;
  menuName: string;
  selectedAt: string;
  source: string;
  version: number;
};

type AllergyIssue = {
  id: string;
  guestId: string;
  guestName: string;
  allergy: string;
  severity: string;
  details: string | null;
  status: string;
  resolvedAt: string | null;
  version: number;
};

type MenuCourseDraft = {
  id: string;
  courseType: string;
  name: string;
  description: string;
};

type ExtendedMenu = MenuResource & {
  vendorNameSnapshot?: string | null;
  courses?: Array<{
    id: string;
    courseType: string;
    name: string;
    description: string | null;
    position: number;
  }>;
  dietaryTags?: Array<{ id: string; code: string; label: string }>;
};

export default function MenusPage() {
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [menus, setMenus] = React.useState<ExtendedMenu[]>([]);
  const [selections, setSelections] = React.useState<MenuSelection[]>([]);
  const [issues, setIssues] = React.useState<AllergyIssue[]>([]);
  const [editing, setEditing] = React.useState<ExtendedMenu | "new" | null>(
    null,
  );
  const [archiveTarget, setArchiveTarget] = React.useState<ExtendedMenu | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<string | null>(null);
  const [selectionQuery, setSelectionQuery] = React.useState("");
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("menu.write");
  const canReadAllergies = capabilities.includes("menu.read_allergies");
  const canResolveAllergies = capabilities.includes("menu.resolve_allergies");
  const canExport = capabilities.includes("menu.export");

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [menuData, selectionData, issueData] = await Promise.all([
        weddingOsApi.menus(currentWorkspace.id),
        weddingOsApi.guestMenuSelections(currentWorkspace.id),
        canReadAllergies
          ? weddingOsApi.allergyIssues(currentWorkspace.id)
          : Promise.resolve({ items: [], nextCursor: null }),
      ]);
      setMenus(menuData.items as ExtendedMenu[]);
      setSelections(selectionData.items as MenuSelection[]);
      setIssues(issueData.items as AllergyIssue[]);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [canReadAllergies, currentWorkspace, demoMode]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const save = async (input: CreateMenu) => {
    if (!currentWorkspace || demoMode || !editing) return;
    setAction("save");
    try {
      if (editing === "new")
        await weddingOsApi.createMenu(currentWorkspace.id, input);
      else
        await weddingOsApi.updateMenu(
          currentWorkspace.id,
          editing.id,
          editing.version ?? 1,
          input,
        );
      const created = editing === "new";
      setEditing(null);
      toast({
        title: created ? "Meniul a fost creat" : "Meniul a fost actualizat",
        variant: "success",
      });
      await load();
    } catch (cause) {
      toast({
        title: "Meniul nu a fost salvat",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const archive = async () => {
    if (!currentWorkspace || demoMode || !archiveTarget) return;
    setAction("archive");
    try {
      await weddingOsApi.deleteMenu(
        currentWorkspace.id,
        archiveTarget.id,
        archiveTarget.version ?? 1,
      );
      setArchiveTarget(null);
      toast({ title: "Meniul a fost arhivat", variant: "success" });
      await load();
    } catch (cause) {
      toast({
        title: "Meniul nu a fost arhivat",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const updateIssue = async (
    issue: AllergyIssue,
    status: "REVIEWING" | "CONFIRMED_WITH_CATERER" | "RESOLVED",
  ) => {
    if (!currentWorkspace) return;
    setAction(`issue-${issue.id}`);
    try {
      await weddingOsApi.resolveAllergyIssue(
        currentWorkspace.id,
        issue.id,
        issue.version,
        {
          status,
          resolutionNote:
            status === "RESOLVED"
              ? "Verificat și închis din Meniuri & alergii."
              : status === "CONFIRMED_WITH_CATERER"
                ? "Confirmat cu locația din Meniuri & alergii."
                : "Preluat pentru verificare din Meniuri & alergii.",
        },
      );
      await load();
      toast({
        title: "Starea alergiei a fost actualizată",
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "Situația nu a putut fi actualizată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const exportCatering = async () => {
    if (!currentWorkspace || demoMode) return;
    setAction("export");
    try {
      const { job } = await weddingOsApi.createCateringExport(
        currentWorkspace.id,
        canReadAllergies,
      );
      toast({
        title: "Pregătim exportul pentru locație",
        description: canReadAllergies
          ? "Exportul include sumarul protejat de alergii."
          : "Exportul nu include date sensibile.",
        variant: "info",
      });
      await waitForJob(job.id);
      const blob = await weddingOsApi.downloadJobArtifact(job.id);
      downloadBlob(blob, "sarbato-catering.xlsx");
      toast({ title: "Exportul a fost descărcat", variant: "success" });
    } catch (cause) {
      toast({
        title: "Exportul a eșuat",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const activeMenus = menus.filter((menu) => menu.status === "active");
  const unresolvedIssues = issues.filter(
    (issue) => issue.status !== "resolved",
  );
  const normalizedQuery = selectionQuery.trim().toLocaleLowerCase("ro");
  const filteredSelections = selections.filter((selection) =>
    `${selection.guestName} ${selection.menuName}`
      .toLocaleLowerCase("ro")
      .includes(normalizedQuery),
  );
  const selectionCount = (menuId: string) =>
    selections.filter((item) => item.menuId === menuId).length;

  if (demoMode)
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title="Meniurile sunt izolate în demo"
        description="Ieși din modul demo pentru a lucra cu selecțiile și alergiile reale."
      />
    );

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-testid="menus-page">
      <PageHeader
        title="Meniuri & alergii"
        description="Configurează meniurile, verifică fiecare selecție și pregătește informațiile pentru locație."
        actions={
          <>
            <Link
              href="/seating"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ArrowLeft className="size-4" /> Plan de mese
            </Link>
            <Button
              variant="outline"
              size="sm"
              disabled={!canExport}
              loading={action === "export"}
              onClick={() => void exportCatering()}
            >
              <Download className="size-4" /> Export locație
            </Button>
            <Button
              size="sm"
              disabled={!canWrite}
              onClick={() => setEditing("new")}
            >
              <Plus className="size-4" /> Meniu nou
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Meniuri active" value={activeMenus.length} />
        <StatCard label="Selecții de meniu" value={selections.length} />
        <StatCard
          label="Alergii de verificat"
          value={unresolvedIssues.length}
          tone={unresolvedIssues.length ? "danger" : undefined}
        />
        <StatCard
          label="Fără meniu"
          value="—"
          hint="Vizibile direct în Plan de mese"
        />
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info-soft p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <div>
          <p className="text-sm font-semibold text-ink">
            Selecțiile RSVP sunt sincronizate automat
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Nu trebuie să imporți manual răspunsurile. Poți schimba meniul unei
            persoane direct din detaliul mesei, iar aici verifici centralizat
            rezultatul.
          </p>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={ShieldAlert}
          title="Meniurile nu sunt disponibile"
          description={error}
          action={{ label: "Reîncearcă", onClick: () => void load() }}
        />
      ) : loading ? (
        <MenusLoading />
      ) : (
        <Tabs defaultValue="menus">
          <TabsList>
            <TabsTrigger
              value="menus"
              badge={<Badge variant="neutral">{menus.length}</Badge>}
            >
              Meniuri
            </TabsTrigger>
            <TabsTrigger
              value="selections"
              badge={<Badge variant="brand">{selections.length}</Badge>}
            >
              Selecții
            </TabsTrigger>
            {canReadAllergies && (
              <TabsTrigger
                value="allergies"
                badge={
                  <Badge
                    variant={unresolvedIssues.length ? "danger" : "success"}
                  >
                    {unresolvedIssues.length}
                  </Badge>
                }
              >
                Alergii
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="menus" className="mt-4">
            {menus.length === 0 ? (
              <EmptyState
                icon={UtensilsCrossed}
                title="Nu există meniuri"
                description="Adaugă meniurile care vor apărea în formularul RSVP și în planul de mese."
                action={
                  canWrite
                    ? {
                        label: "Adaugă meniu",
                        onClick: () => setEditing("new"),
                      }
                    : undefined
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {menus.map((menu) => (
                  <MenuCard
                    key={menu.id}
                    menu={menu}
                    selections={selectionCount(menu.id)}
                    canWrite={canWrite}
                    onEdit={() => setEditing(menu)}
                    onArchive={() => setArchiveTarget(menu)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="selections" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <div className="border-b border-line p-4">
                  <div className="relative max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                    <Input
                      aria-label="Caută selecție"
                      value={selectionQuery}
                      onChange={(event) =>
                        setSelectionQuery(event.target.value)
                      }
                      placeholder="Caută invitat sau meniu"
                      className="pl-9"
                    />
                  </div>
                </div>
                {filteredSelections.length ? (
                  <Table minWidth="680px">
                    <THead>
                      <TR>
                        <TH>Invitat</TH>
                        <TH>Meniu</TH>
                        <TH>Sursă</TH>
                        <TH>Actualizat</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {filteredSelections.map((selection) => (
                        <TR key={selection.id}>
                          <TD className="font-medium text-ink">
                            {selection.guestName}
                          </TD>
                          <TD>
                            <Badge variant="brand">
                              {selection.menuName || "Meniu indisponibil"}
                            </Badge>
                          </TD>
                          <TD>
                            {selection.source === "organizer"
                              ? "Organizator"
                              : "RSVP invitat"}
                          </TD>
                          <TD>{formatDate(selection.selectedAt)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <EmptyState
                    icon={Users}
                    title={
                      selections.length
                        ? "Nicio selecție nu corespunde căutării"
                        : "Nu există încă selecții"
                    }
                    description="Selecțiile apar după răspunsurile RSVP sau după alegerea unui meniu în Plan de mese."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {canReadAllergies && (
            <TabsContent value="allergies" className="mt-4">
              <AllergyPanel
                issues={issues}
                canResolve={canResolveAllergies}
                action={action}
                onUpdate={updateIssue}
              />
            </TabsContent>
          )}
        </Tabs>
      )}

      {editing && (
        <MenuEditor
          key={editing === "new" ? "new" : editing.id}
          open
          menu={editing === "new" ? null : editing}
          position={editing === "new" ? menus.length : editing.position}
          saving={action === "save"}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => void archive()}
        title="Arhivezi meniul?"
        description={
          archiveTarget
            ? `${selectionCount(archiveTarget.id)} selecții active folosesc acest meniu. Selecțiile istorice se păstrează, dar meniul nu mai poate fi ales.`
            : "Meniul nu va mai putea fi ales."
        }
        confirmLabel="Arhivează meniul"
        destructive
        loading={action === "archive"}
      />
    </div>
  );
}

function MenuCard({
  menu,
  selections,
  canWrite,
  onEdit,
  onArchive,
}: {
  menu: ExtendedMenu;
  selections: number;
  canWrite: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const courses = menu.courses ?? [];
  const tags = menu.dietaryTags ?? [];
  return (
    <Card className="min-w-0">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <UtensilsCrossed className="size-5" />
          </span>
          <Badge
            variant={
              menu.status === "active"
                ? "success"
                : menu.status === "draft"
                  ? "warning"
                  : "neutral"
            }
          >
            {menu.status === "active"
              ? "Activ"
              : menu.status === "draft"
                ? "Draft"
                : "Inactiv"}
          </Badge>
        </div>
        <h3 className="mt-4 break-words font-semibold text-ink">{menu.name}</h3>
        <p className="mt-1 line-clamp-3 min-h-10 text-sm leading-5 text-muted">
          {menu.description || "Fără descriere"}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="brand">{selections} selecții</Badge>
          <Badge variant="outline">
            {menu.audience === "adult"
              ? "Adulți"
              : menu.audience === "child"
                ? "Copii"
                : "Toți"}
          </Badge>
          {courses.length > 0 && (
            <Badge variant="neutral">{courses.length} feluri</Badge>
          )}
        </div>
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 4).map((tag) => (
              <Badge key={tag.id} variant="neutral">
                {tag.label}
              </Badge>
            ))}
          </div>
        )}
        {menu.priceMinor ? (
          <p className="mt-3 text-sm font-semibold tabular-nums text-ink">
            {formatMoney(menu.priceMinor, menu.currency ?? "RON")}
          </p>
        ) : null}
        {canWrite && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="size-4" /> Editează
            </Button>
            <Button size="sm" variant="destructive-outline" onClick={onArchive}>
              <Trash2 className="size-4" /> Arhivează
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AllergyPanel({
  issues,
  canResolve,
  action,
  onUpdate,
}: {
  issues: AllergyIssue[];
  canResolve: boolean;
  action: string | null;
  onUpdate: (
    issue: AllergyIssue,
    status: "REVIEWING" | "CONFIRMED_WITH_CATERER" | "RESOLVED",
  ) => Promise<void>;
}) {
  if (!issues.length)
    return (
      <Card>
        <EmptyState
          icon={CheckCircle2}
          title="Nu există alergii de verificat"
          description="Alergiile raportate de invitați vor apărea aici și în detaliul mesei."
        />
      </Card>
    );
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <ShieldAlert className="mt-0.5 size-5 text-danger" />
          <div>
            <h2 className="text-sm font-semibold text-ink">
              Situații de alergii
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              Date protejate. Confirmă fiecare situație cu locația și marcheaz-o
              rezolvată doar după verificare.
            </p>
          </div>
        </div>
        <Table minWidth="880px">
          <THead>
            <TR>
              <TH>Invitat</TH>
              <TH>Alergie</TH>
              <TH>Severitate</TH>
              <TH>Stare</TH>
              <TH className="text-right">Acțiuni</TH>
            </TR>
          </THead>
          <TBody>
            {issues.map((issue) => (
              <TR key={issue.id}>
                <TD className="font-medium text-ink">{issue.guestName}</TD>
                <TD>
                  <p>{issue.allergy}</p>
                  {issue.details && (
                    <p className="mt-1 max-w-80 text-xs text-muted">
                      {issue.details}
                    </p>
                  )}
                </TD>
                <TD>
                  <Badge variant={severityVariant(issue.severity)}>
                    {severityLabel(issue.severity)}
                  </Badge>
                </TD>
                <TD>
                  <Badge
                    variant={
                      issue.status === "resolved"
                        ? "success"
                        : issue.status === "confirmed_with_caterer"
                          ? "brand"
                          : "warning"
                    }
                  >
                    {statusLabel(issue.status)}
                  </Badge>
                </TD>
                <TD>
                  <div className="flex justify-end gap-2">
                    {issue.status === "unreviewed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void onUpdate(issue, "REVIEWING")}
                        disabled={!canResolve}
                        loading={action === `issue-${issue.id}`}
                      >
                        Preia
                      </Button>
                    )}
                    {issue.status !== "confirmed_with_caterer" &&
                      issue.status !== "resolved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void onUpdate(issue, "CONFIRMED_WITH_CATERER")
                          }
                          disabled={!canResolve}
                          loading={action === `issue-${issue.id}`}
                        >
                          Confirmă locația
                        </Button>
                      )}
                    {issue.status !== "resolved" && (
                      <Button
                        size="sm"
                        onClick={() => void onUpdate(issue, "RESOLVED")}
                        disabled={!canResolve}
                        loading={action === `issue-${issue.id}`}
                      >
                        Rezolvat
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MenuEditor({
  open,
  menu,
  position,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  menu: ExtendedMenu | null;
  position: number;
  saving: boolean;
  onClose: () => void;
  onSave: (input: CreateMenu) => Promise<void>;
}) {
  const [name, setName] = React.useState(menu?.name ?? "");
  const [description, setDescription] = React.useState(menu?.description ?? "");
  const [audience, setAudience] = React.useState<"ADULT" | "CHILD" | "ALL">(
    (menu?.audience.toUpperCase() as "ADULT" | "CHILD" | "ALL") ?? "ALL",
  );
  const [status, setStatus] = React.useState<"DRAFT" | "ACTIVE" | "INACTIVE">(
    (menu?.status.toUpperCase() as "DRAFT" | "ACTIVE" | "INACTIVE") ?? "ACTIVE",
  );
  const [price, setPrice] = React.useState(
    menu?.priceMinor ? String(menu.priceMinor / 100) : "",
  );
  const [vendor, setVendor] = React.useState(menu?.vendorNameSnapshot ?? "");
  const [tags, setTags] = React.useState(
    (menu?.dietaryTags ?? []).map((tag) => tag.code).join(", "),
  );
  const [courses, setCourses] = React.useState<MenuCourseDraft[]>(() =>
    (menu?.courses ?? []).map((course) => ({
      id: course.id,
      courseType: course.courseType,
      name: course.name,
      description: course.description ?? "",
    })),
  );
  const addCourse = () =>
    setCourses((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        courseType: "Fel principal",
        name: "",
        description: "",
      },
    ]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void onSave({
      name: name.trim(),
      description: description.trim() || null,
      audience,
      priceMinor: price ? Math.round(Number(price) * 100) : null,
      currency: price ? "RON" : null,
      vendorNameSnapshot: vendor.trim() || null,
      status,
      position,
      courses: courses
        .filter((course) => course.name.trim())
        .map((course, index) => ({
          courseType: course.courseType.trim() || "Fel",
          name: course.name.trim(),
          description: course.description.trim() || null,
          position: index,
        })),
      dietaryTags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={menu ? "Editează meniul" : "Meniu nou"}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nume" required className="sm:col-span-2">
            <Input
              required
              maxLength={180}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Meniu clasic"
            />
          </Field>
          <Field label="Descriere" className="sm:col-span-2">
            <Textarea
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </Field>
          <Field label="Audiență">
            <Select
              value={audience}
              onChange={(event) =>
                setAudience(event.target.value as typeof audience)
              }
            >
              <option value="ALL">Toți</option>
              <option value="ADULT">Adulți</option>
              <option value="CHILD">Copii</option>
            </Select>
          </Field>
          <Field label="Stare">
            <Select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              <option value="ACTIVE">Activ</option>
              <option value="DRAFT">Draft</option>
              <option value="INACTIVE">Inactiv</option>
            </Select>
          </Field>
          <Field label="Preț / persoană (RON)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="Opțional"
            />
          </Field>
          <Field label="Furnizor / locație">
            <Input
              maxLength={180}
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
              placeholder="Snapshot informativ"
            />
          </Field>
          <Field
            label="Etichete dietetice"
            hint="Separate prin virgulă"
            className="sm:col-span-2"
          >
            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="vegetarian, fără gluten"
            />
          </Field>
        </div>
        <div className="rounded-xl border border-line">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                Felurile meniului
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Adaugă structura pe care o vei confirma cu locația.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCourse}
            >
              <Plus className="size-4" /> Fel
            </Button>
          </div>
          {courses.length ? (
            <div className="space-y-3 p-4">
              {courses.map((course, index) => (
                <div
                  key={course.id}
                  className="grid gap-3 rounded-lg bg-subtle p-3 sm:grid-cols-[150px_1fr_auto]"
                >
                  <Field label={`Tip ${index + 1}`}>
                    <Input
                      value={course.courseType}
                      onChange={(event) =>
                        setCourses((current) =>
                          current.map((item) =>
                            item.id === course.id
                              ? { ...item, courseType: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Aperitiv"
                    />
                  </Field>
                  <Field label="Denumire">
                    <Input
                      value={course.name}
                      onChange={(event) =>
                        setCourses((current) =>
                          current.map((item) =>
                            item.id === course.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Platou rece"
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="self-end"
                    aria-label={`Elimină felul ${index + 1}`}
                    onClick={() =>
                      setCourses((current) =>
                        current.filter((item) => item.id !== course.id),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Field label="Descriere" className="sm:col-span-3">
                    <Input
                      value={course.description}
                      onChange={(event) =>
                        setCourses((current) =>
                          current.map((item) =>
                            item.id === course.id
                              ? { ...item, description: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Opțional"
                    />
                  </Field>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted">
              Nu ai adăugat încă felurile. Meniul poate fi salvat și fără ele.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" loading={saving} disabled={!name.trim()}>
            Salvează meniul
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MenusLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-11 w-80 max-w-full" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-72" />
        ))}
      </div>
    </div>
  );
}

function statusLabel(status: string) {
  return (
    {
      unreviewed: "Neverificată",
      reviewing: "În verificare",
      confirmed_with_caterer: "Confirmată cu locația",
      resolved: "Rezolvată",
    }[status] ?? status
  );
}
function severityLabel(severity: string) {
  return (
    {
      low: "Scăzută",
      medium: "Medie",
      high: "Ridicată",
      life_threatening: "Risc vital",
      unknown: "Necunoscută",
    }[severity] ?? severity
  );
}
function severityVariant(severity: string): "danger" | "warning" | "neutral" {
  if (["life_threatening", "high"].includes(severity)) return "danger";
  if (severity === "medium") return "warning";
  return "neutral";
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "—"
    : new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" }).format(date);
}
function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("ro-RO", { style: "currency", currency }).format(
    amountMinor / 100,
  );
}

async function waitForJob(jobId: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const job = await weddingOsApi.job(jobId);
    if (job.status === "completed") return;
    if (["failed", "dead_letter", "cancelled"].includes(job.status))
      throw new Error(job.error?.message ?? "Job eșuat");
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  throw new Error("Exportul nu s-a încheiat la timp");
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
