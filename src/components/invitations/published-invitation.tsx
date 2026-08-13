"use client";

import { snapshotFromPersisted } from "@/lib/invitations/editor-model";
import { InvitationRenderer } from "./invitation-renderer";

export function PublishedInvitation({
  invitation,
  token,
  onAddCalendar,
  onRsvp,
}: {
  invitation: Record<string, unknown>;
  token: string;
  onAddCalendar: () => void;
  onRsvp?: () => void;
}) {
  const document = record(invitation.document);
  const publishedSections = Array.isArray(document.sections)
    ? (document.sections as NonNullable<
        Parameters<typeof snapshotFromPersisted>[0]
      >)
    : [];
  const snapshot = snapshotFromPersisted(
    publishedSections,
    record(invitation.settings) as Parameters<typeof snapshotFromPersisted>[1],
  );
  if (!publishedSections.length) snapshot.sections = [];

  return (
    <InvitationRenderer
      snapshot={snapshot}
      resolveMedia={(mediaId, externalUrl = "") =>
        mediaId
          ? `/api/v1/guest/invitation-media/${encodeURIComponent(mediaId)}?token=${encodeURIComponent(token)}`
          : safeImageUrl(externalUrl)
      }
      onAddCalendar={onAddCalendar}
      onRsvp={onRsvp}
      className="shadow-pop"
    />
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}
