"use client";
import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { CinematicReveal } from "./cinematic-reveal";
import { invitationExperienceFromResource } from "./invitation-experience";
import { InvitationRenderer } from "./invitation-renderer";
import type {
  InvitationDevice,
  InvitationEditorSnapshot,
} from "@/lib/invitations/editor-model";

const deviceWidth: Record<InvitationDevice, number> = {
  desktop: 1024,
  tablet: 768,
  mobile: 390,
};

export function editorRevealSettings(
  snapshot: InvitationEditorSnapshot,
  coverImageUrl: string,
) {
  const settings = invitationExperienceFromResource({
    settings: { experience: snapshot.experience },
  });
  return {
    ...settings,
    // The editor already resolved workspace media to a previewable URL; the
    // reveal itself only ever renders `coverImageUrl`.
    coverImageUrl: coverImageUrl || settings.coverImageUrl,
  };
}

export function EditorRevealPreview({
  open,
  onClose,
  snapshot,
  device,
  coverImageUrl,
  resolveMedia,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: InvitationEditorSnapshot;
  device: InvitationDevice;
  coverImageUrl: string;
  resolveMedia: (mediaId: string, externalUrl?: string) => string;
}) {
  const [replay, setReplay] = React.useState(0);
  const settings = React.useMemo(
    () => editorRevealSettings(snapshot, coverImageUrl),
    [coverImageUrl, snapshot],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cum se deschide invitația"
      description={
        settings.enabled
          ? "Exact animația pe care o vede invitatul când deschide linkul personal, redată la lățimea dispozitivului selectat."
          : "Deschiderea este dezactivată, deci invitatul vede imediat conținutul. Alege plicul sau panourile ca să ai o animație de început."
      }
      size="full"
    >
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setReplay((c) => c + 1)}>
            <RotateCcw className="size-3.5" aria-hidden />
            Redă din nou
          </Button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-sunken">
          <div
            className="mx-auto"
            style={{ maxWidth: `${deviceWidth[device]}px` }}
          >
            {/* Mounting on open is what starts the reveal, so remounting on
                replay is all "Redă din nou" needs to do. */}
            {open ? (
              <CinematicReveal
                key={replay}
                settings={settings}
                variant="embedded"
              >
                <InvitationRenderer
                  snapshot={snapshot}
                  resolveMedia={resolveMedia}
                  emptyState={
                    <div className="grid min-h-72 place-items-center p-8 text-center text-sm opacity-60">
                      Afișează o secțiune ca să vezi ce apare după deschidere.
                    </div>
                  }
                />
              </CinematicReveal>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
