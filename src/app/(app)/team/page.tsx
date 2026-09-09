"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock3,
  Mail,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { teamMembers as demoTeamMembers } from "@/lib/data/wedding";
import { formatRelativeTime } from "@/lib/utils";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { defaultRoleTemplates } from "@weddingos/contracts";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui";

type TeamRole = "owner" | "partner" | "planner" | "family" | "viewer";

type TeamRow = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: "active" | "invited";
  lastActive?: string;
  capabilities: string[];
  version: number;
};

const roleToApi = {
  owner: "couple_owner",
  partner: "couple_partner",
  planner: "wedding_planner",
  family: "family_collaborator",
  viewer: "viewer",
} as const;

const roleFromApi: Record<string, TeamRole> = {
  couple_owner: "owner",
  couple_partner: "partner",
  wedding_planner: "planner",
  family_collaborator: "family",
  viewer: "viewer",
};

const roleLabels: Record<TeamRole, string> = {
  owner: "Proprietar",
  partner: "Partener",
  planner: "Organizator",
  family: "Familie",
  viewer: "Doar vizualizare",
};

const roleDescriptions: Record<TeamRole, string> = {
  owner: "Acces complet, facturare și administrarea echipei",
  partner: "Acces complet la planificare și decizii",
  planner: "Poate gestiona planul, furnizorii și documentele",
  family: "Poate colabora la sarcini, invitați și comentarii",
  viewer: "Poate consulta informațiile, fără modificări",
};

function defaultCapabilities(role: TeamRole): string[] {
  const template = defaultRoleTemplates.find(
    (item) => item.key === roleToApi[role],
  );
  return template ? [...template.capabilities] : [];
}

export default function TeamPage() {
  const { toast } = useToast();
  const { currentWorkspace, demoMode, bootstrap } = useWorkspace();
  const [members, setMembers] = React.useState<TeamRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<TeamRole>("family");
  const [emailError, setEmailError] = React.useState("");
  const [removeId, setRemoveId] = React.useState<string | null>(null);

  const activeCount = members.filter(
    (member) => member.status === "active",
  ).length;
  const invitedCount = members.length - activeCount;
  const selectedForRemoval = members.find((member) => member.id === removeId);
  const capabilities = new Set(bootstrap?.membership.capabilities ?? []);
  const canInvite = capabilities.has("team.invite");
  const canUpdateRole = capabilities.has("team.update_role");
  const canRemove = capabilities.has("team.remove");

  const loadTeam = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    if (demoMode) {
      setMembers(
        demoTeamMembers.map((member, index) => ({
          ...member,
          capabilities: defaultCapabilities(member.role),
          version: index + 1,
        })),
      );
      setLoading(false);
      return;
    }
    try {
      const team = await weddingOsApi.team(currentWorkspace.id);
      setMembers([
        ...team.members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: roleFromApi[member.role] ?? "viewer",
          status: "active" as const,
          lastActive: member.lastActiveAt ?? undefined,
          capabilities: member.capabilities,
          version: member.version,
        })),
        ...team.invitations.map((invitation) => ({
          id: invitation.id,
          name: invitation.email.split("@")[0] ?? invitation.email,
          email: invitation.email,
          role: roleFromApi[invitation.role] ?? "viewer",
          status: "invited" as const,
          capabilities: defaultCapabilities(
            roleFromApi[invitation.role] ?? "viewer",
          ),
          version: invitation.version,
        })),
      ]);
    } catch (error) {
      toast({
        title: "Echipa nu a putut fi încărcată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, demoMode, toast]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadTeam(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadTeam]);

  const openInvite = () => {
    setEmail("");
    setRole("family");
    setEmailError("");
    setInviteOpen(true);
  };

  const submitInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (demoMode) return;
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      setEmailError("Introdu o adresă de e-mail validă.");
      return;
    }
    if (members.some((member) => member.email.toLowerCase() === normalized)) {
      setEmailError(
        "Această persoană este deja în echipă sau a fost invitată.",
      );
      return;
    }

    try {
      if (currentWorkspace) {
        await weddingOsApi.invite(currentWorkspace.id, {
          email: normalized,
          roleTemplate:
            roleToApi[role] === "couple_owner"
              ? "couple_partner"
              : roleToApi[role],
          capabilityOverrides: [],
        });
        await loadTeam();
      }
      setInviteOpen(false);
      toast({
        title: "Invitație salvată și pusă în coadă",
        description: `${normalized} va primi emailul pentru rolul ${roleLabels[role].toLowerCase()} după procesarea livrării.`,
        variant: "success",
      });
    } catch (error) {
      setEmailError(apiErrorMessage(error));
    }
  };

  const changeRole = async (id: string, nextRole: TeamRole) => {
    if (demoMode) return;
    const member = members.find((item) => item.id === id);
    if (!member || member.status !== "active") return;
    try {
      if (currentWorkspace) {
        await weddingOsApi.updateMember(currentWorkspace.id, id, {
          roleTemplate: roleToApi[nextRole],
          version: member.version,
        });
        await loadTeam();
      }
      toast({
        title: "Rol actualizat",
        description: `${member.name} are acum rolul ${roleLabels[nextRole].toLowerCase()}.`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Rolul nu a fost schimbat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };

  const resendInvite = async (member: TeamRow) => {
    if (demoMode) return;
    try {
      if (currentWorkspace)
        await weddingOsApi.resendInvitation(currentWorkspace.id, member.id);
      toast({
        title: "Retrimitere pusă în coadă",
        description: `Livrarea noului email către ${member.email} va fi procesată asincron.`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Invitația nu a fost retrimisă",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Echipă"
        description="Oamenii care vă ajută să organizați nunta, cu acces potrivit pentru fiecare rol."
        actions={
          canInvite || demoMode ? (
            <Button
              size="sm"
              onClick={openInvite}
              disabled={loading || !currentWorkspace || demoMode}
              title={demoMode ? "Disponibil într-un cont real" : undefined}
            >
              <UserPlus className="size-4" aria-hidden />
              Invită membru
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <UsersRound className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink">
                {members.length}
              </p>
              <p className="text-xs text-muted">membri în spațiul de lucru</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-success">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink">
                {activeCount}
              </p>
              <p className="text-xs text-muted">membri activi</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-warning-soft text-warning">
              <Clock3 className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink">
                {invitedCount}
              </p>
              <p className="text-xs text-muted">invitații în așteptare</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="hidden md:block">
        <Table minWidth="720px">
          <THead>
            <TR>
              <TH>Membru</TH>
              <TH>Rol și permisiuni</TH>
              <TH>Stare</TH>
              <TH>Ultima activitate</TH>
              <TH className="w-12" />
            </TR>
          </THead>
          <TBody>
            {members.map((member) => (
              <TR key={member.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name} />
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{member.name}</p>
                      <p className="truncate text-xs text-faint">
                        {member.email}
                      </p>
                    </div>
                  </div>
                </TD>
                <TD>
                  {member.role === "owner" ? (
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {roleLabels[member.role]}
                      </p>
                      <p className="max-w-xs text-xs text-faint">
                        {roleDescriptions[member.role]}
                      </p>
                      <p className="mt-1 max-w-xs text-[11px] text-faint">
                        Acces configurat: {member.capabilities.length}{" "}
                        permisiuni
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Select
                        aria-label={`Rol pentru ${member.name}`}
                        value={member.role}
                        disabled={
                          member.status === "invited" ||
                          demoMode ||
                          !canUpdateRole
                        }
                        onChange={(event) =>
                          void changeRole(
                            member.id,
                            event.target.value as TeamRole,
                          )
                        }
                        className="max-w-[210px]"
                      >
                        {(
                          [
                            "partner",
                            "planner",
                            "family",
                            "viewer",
                          ] as TeamRole[]
                        ).map((value) => (
                          <option key={value} value={value}>
                            {roleLabels[value]}
                          </option>
                        ))}
                      </Select>
                      <p className="mt-1 max-w-xs text-[11px] text-faint">
                        Acces configurat: {member.capabilities.length}{" "}
                        permisiuni
                      </p>
                    </div>
                  )}
                </TD>
                <TD>
                  <Badge
                    variant={member.status === "active" ? "success" : "warning"}
                    dot
                  >
                    {member.status === "active" ? "Activ" : "Invitat"}
                  </Badge>
                </TD>
                <TD className="text-muted">
                  {member.lastActive
                    ? formatRelativeTime(member.lastActive)
                    : "Nu a acceptat încă"}
                </TD>
                <TD>
                  {member.role !== "owner" &&
                    !demoMode &&
                    (canRemove ||
                      (member.status === "invited" && canInvite)) && (
                      <MemberMenu
                        member={member}
                        allowResend={canInvite}
                        allowRemove={canRemove}
                        onResend={resendInvite}
                        onRemove={() => setRemoveId(member.id)}
                      />
                    )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {members.map((member) => (
          <Card key={member.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={member.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{member.name}</p>
                  <p className="truncate text-xs text-faint">{member.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        member.status === "active" ? "success" : "warning"
                      }
                      dot
                    >
                      {member.status === "active" ? "Activ" : "Invitat"}
                    </Badge>
                    <span className="text-xs text-muted">
                      {roleLabels[member.role]}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-faint">
                    Acces configurat: {member.capabilities.length} permisiuni
                  </p>
                </div>
                {member.role !== "owner" &&
                  !demoMode &&
                  (canRemove || (member.status === "invited" && canInvite)) && (
                    <MemberMenu
                      member={member}
                      allowResend={canInvite}
                      allowRemove={canRemove}
                      onResend={resendInvite}
                      onRemove={() => setRemoveId(member.id)}
                    />
                  )}
              </div>
              {member.role !== "owner" && canUpdateRole && (
                <Field
                  label="Rol"
                  htmlFor={`role-${member.id}`}
                  className="mt-4"
                >
                  <Select
                    id={`role-${member.id}`}
                    value={member.role}
                    disabled={member.status === "invited" || demoMode}
                    onChange={(event) =>
                      void changeRole(member.id, event.target.value as TeamRole)
                    }
                  >
                    {(
                      ["partner", "planner", "family", "viewer"] as TeamRole[]
                    ).map((value) => (
                      <option key={value} value={value}>
                        {roleLabels[value]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invită un membru"
        description="Invitația este valabilă 7 zile. Poți schimba rolul oricând."
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Renunță
            </Button>
            <Button type="submit" form="invite-member-form">
              <Mail className="size-4" aria-hidden />
              Trimite invitația
            </Button>
          </>
        }
      >
        <form
          id="invite-member-form"
          onSubmit={submitInvite}
          className="space-y-4"
          noValidate
        >
          <Field
            label="Adresă de e-mail"
            htmlFor="invite-email"
            required
            error={emailError}
          >
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (emailError) setEmailError("");
              }}
              placeholder="nume@exemplu.ro"
              invalid={Boolean(emailError)}
              autoComplete="email"
            />
          </Field>
          <Field
            label="Rol"
            htmlFor="invite-role"
            hint={roleDescriptions[role]}
          >
            <Select
              id="invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value as TeamRole)}
            >
              {(["partner", "planner", "family", "viewer"] as TeamRole[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {roleLabels[value]}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <div className="flex gap-3 rounded-xl bg-subtle p-3.5">
            <ShieldCheck
              className="mt-0.5 size-5 shrink-0 text-brand"
              aria-hidden
            />
            <p className="text-[13px] leading-relaxed text-muted">
              Membrii văd doar acest spațiu de lucru. Datele de facturare rămân
              disponibile exclusiv proprietarului.
            </p>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeId)}
        onClose={() => setRemoveId(null)}
        onConfirm={() => {
          if (!removeId) return;
          void (async () => {
            try {
              if (demoMode) return;
              if (currentWorkspace && selectedForRemoval) {
                if (selectedForRemoval.status === "invited") {
                  await weddingOsApi.revokeInvitation(
                    currentWorkspace.id,
                    selectedForRemoval.id,
                  );
                } else {
                  await weddingOsApi.removeMember(
                    currentWorkspace.id,
                    selectedForRemoval.id,
                  );
                }
              }
              setMembers((current) =>
                current.filter((member) => member.id !== removeId),
              );
              setRemoveId(null);
              toast({
                title:
                  selectedForRemoval?.status === "invited"
                    ? "Invitație revocată"
                    : "Membru eliminat",
                description: `${selectedForRemoval?.name ?? "Membrul"} nu mai are acces la spațiul de lucru.`,
                variant: "success",
              });
            } catch (error) {
              toast({
                title: "Accesul nu a fost modificat",
                description: apiErrorMessage(error),
                variant: "error",
              });
            }
          })();
        }}
        title="Elimini membrul din echipă?"
        description={`${selectedForRemoval?.name ?? "Acest membru"} va pierde imediat accesul, dar activitatea existentă va rămâne în istoric.`}
        confirmLabel="Elimină"
        destructive
      />
    </div>
  );
}

function MemberMenu({
  member,
  allowResend,
  allowRemove,
  onResend,
  onRemove,
}: {
  member: TeamRow;
  allowResend: boolean;
  allowRemove: boolean;
  onResend: (member: TeamRow) => void;
  onRemove: () => void;
}) {
  return (
    <Dropdown>
      <DropdownTrigger>
        <button
          type="button"
          aria-label={`Acțiuni pentru ${member.name}`}
          className="inline-flex size-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-subtle hover:text-ink"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </DropdownTrigger>
      <DropdownContent>
        {member.status === "invited" && allowResend && (
          <DropdownItem icon={<RefreshCw />} onSelect={() => onResend(member)}>
            Retrimite invitația
          </DropdownItem>
        )}
        {allowRemove ? (
          <DropdownItem icon={<Trash2 />} destructive onSelect={onRemove}>
            {member.status === "invited"
              ? "Revocă invitația"
              : "Elimină din echipă"}
          </DropdownItem>
        ) : null}
      </DropdownContent>
    </Dropdown>
  );
}
