import type { Request } from "express";
import type { CapabilityKey } from "@weddingos/contracts";

export type AuthenticatedSession = {
  sessionId: string;
  userId: string;
  email: string;
  emailVerified: boolean;
};

export type AuthorizedMembership = {
  membershipId: string;
  workspaceId: string;
  roleTemplate: string;
  capabilities: CapabilityKey[];
  version: number;
};

export type WeddingOsRequest = Request & {
  requestId: string;
  correlationId: string;
  auth?: AuthenticatedSession;
  membership?: AuthorizedMembership;
};
