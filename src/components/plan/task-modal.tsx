"use client";

import * as React from "react";
import type { CreateTask } from "@weddingos/contracts";
import { Plus, X } from "lucide-react";
import { taskCategories } from "@/lib/data/tasks";
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from "@/components/ui";

type MemberOption = { id: string; name: string };

type TaskModalProps = {
  open: boolean;
  onClose: () => void;
  members?: MemberOption[];
  onCreate: (input: CreateTask, subtasks: string[]) => Promise<void>;
};

const initialValues: Record<string, string> = {
  category: "Furnizori",
  priority: "medium",
  reminder: "none",
};

export function TaskModal(props: TaskModalProps) {
  return <TaskModalContent key={props.open ? "open" : "closed"} {...props} />;
}

function TaskModalContent({ open, onClose, onCreate, members = [] }: TaskModalProps) {
  const [values, setValues] = React.useState<Record<string, string>>(initialValues);
  const [subtasks, setSubtasks] = React.useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const set = (key: string) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    if (key === "title") setError("");
  };

  const submit = async (andAnother: boolean) => {
    if (!values.title?.trim()) {
      setError("Titlul sarcinii este obligatoriu.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const dueAt = values.deadline ? new Date(`${values.deadline}T12:00:00`).toISOString() : null;
      const startAt = values.startDate ? new Date(`${values.startDate}T09:00:00`).toISOString() : null;
      const reminderDays = values.reminder === "1d" ? 1 : values.reminder === "3d" ? 3 : values.reminder === "1w" ? 7 : 0;
      const reminderAt = dueAt && reminderDays
        ? new Date(new Date(dueAt).getTime() - reminderDays * 86_400_000).toISOString()
        : undefined;
      await onCreate(
        {
          title: values.title.trim(),
          description: values.description?.trim() || undefined,
          category: values.category || "planning",
          priority: (values.priority || "medium") as CreateTask["priority"],
          startAt,
          dueAt,
          assigneeMembershipId: values.owner || null,
          estimatedEffortMinutes:
            values.effort === "s" ? 45 : values.effort === "l" ? 480 : 180,
          isPrivate: values.private === "on",
          position: 0,
          reminder: reminderAt
            ? { scheduledAt: reminderAt, channel: "in_app" }
            : undefined,
        },
        subtasks,
      );
      if (andAnother) {
        setValues(initialValues);
        setSubtasks([]);
      } else {
        onClose();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sarcina nu a putut fi salvată.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sarcină nouă"
      description="Completează detaliile. Sarcina va fi salvată direct în plan."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button variant="secondary" loading={saving} onClick={() => void submit(true)}>
            Creează și adaugă alta
          </Button>
          <Button loading={saving} onClick={() => void submit(false)}>
            Creează sarcina
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Titlu" required error={error} className="sm:col-span-2">
          <Input autoFocus placeholder="ex. Rezervă autocarele pentru oaspeți" value={values.title ?? ""} onChange={set("title")} invalid={!!error} />
        </Field>
        <Field label="Descriere" className="sm:col-span-2">
          <Textarea placeholder="Context și criterii de finalizare…" value={values.description ?? ""} onChange={set("description")} />
        </Field>
        <Field label="Categorie">
          <Select value={values.category} onChange={set("category")}>
            {taskCategories.map((category) => <option key={category}>{category}</option>)}
          </Select>
        </Field>
        <Field label="Prioritate">
          <Select value={values.priority} onChange={set("priority")}>
            <option value="low">Scăzută</option><option value="medium">Medie</option>
            <option value="high">Ridicată</option><option value="urgent">Urgentă</option>
          </Select>
        </Field>
        <Field label="Responsabil">
          <Select value={values.owner ?? ""} onChange={set("owner")}>
            <option value="">Nealocat</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </Select>
        </Field>
        <Field label="Efort estimat">
          <Select value={values.effort ?? "m"} onChange={set("effort")}>
            <option value="s">Mic (&lt; 1 oră)</option><option value="m">Mediu (câteva ore)</option>
            <option value="l">Mare (o zi+)</option>
          </Select>
        </Field>
        <Field label="Termen limită"><Input type="date" value={values.deadline ?? ""} onChange={set("deadline")} /></Field>
        <Field label="Dată de început"><Input type="date" value={values.startDate ?? ""} onChange={set("startDate")} /></Field>
        <Field label="Reamintire">
          <Select value={values.reminder} onChange={set("reminder")}>
            <option value="none">Fără reamintire</option><option value="1d">Cu 1 zi înainte</option>
            <option value="3d">Cu 3 zile înainte</option><option value="1w">Cu 1 săptămână înainte</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <p className="text-[13px] font-medium text-ink">Subsarcini</p>
          <ul className="mt-2 space-y-1.5">
            {subtasks.map((title, index) => (
              <li key={`${title}-${index}`} className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm text-ink">
                <span className="flex-1">{title}</span>
                <button type="button" onClick={() => setSubtasks((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Elimină ${title}`} className="text-faint hover:text-danger">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Input value={subtaskDraft} onChange={(event) => setSubtaskDraft(event.target.value)} placeholder="Adaugă o subsarcină…" />
            <Button type="button" variant="outline" onClick={() => {
              if (!subtaskDraft.trim()) return;
              setSubtasks((items) => [...items, subtaskDraft.trim()]);
              setSubtaskDraft("");
            }}><Plus className="size-4" /></Button>
          </div>
        </div>
        <div className="sm:col-span-2 flex flex-col gap-2.5">
          <Checkbox checked={values.private === "on"} onCheckedChange={(checked) => setValues((current) => ({ ...current, private: checked ? "on" : "" }))} label="Privată — vizibilă numai persoanelor autorizate" />
          <p className="text-xs text-faint">Sarcinile recurente și atașamentele sunt planificate pentru o etapă viitoare.</p>
        </div>
      </div>
    </Modal>
  );
}
