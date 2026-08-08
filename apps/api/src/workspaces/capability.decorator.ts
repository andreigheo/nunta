import { SetMetadata } from "@nestjs/common";
import type { CapabilityKey } from "@weddingos/contracts";

export const REQUIRED_CAPABILITY = "weddingos.required-capability";
export const RequireCapability = (capability: CapabilityKey) =>
  SetMetadata(REQUIRED_CAPABILITY, capability);
