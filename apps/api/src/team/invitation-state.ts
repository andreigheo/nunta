import { HttpStatus } from "@nestjs/common";
import { problem } from "../common/problem";

export type InvitationState = {
  status: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export function assertPendingInvitation(
  invitation: InvitationState,
  now = new Date(),
): void {
  if (invitation.status === "REVOKED" || invitation.revokedAt) {
    problem("INVITATION_REVOKED", HttpStatus.GONE, "Invitation revoked");
  }
  if (invitation.status !== "PENDING") {
    problem("TOKEN_INVALID", HttpStatus.CONFLICT, "Invitation already used");
  }
  if (invitation.expiresAt <= now) {
    problem("TOKEN_EXPIRED", HttpStatus.GONE, "Invitation expired");
  }
}
