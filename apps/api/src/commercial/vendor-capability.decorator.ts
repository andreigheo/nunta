import { SetMetadata } from "@nestjs/common";
import type { CapabilityKey } from "@weddingos/contracts";

export const REQUIRED_VENDOR_CAPABILITY =
  "weddingos.required-vendor-capability";

export const RequireVendorCapability = (capability: CapabilityKey) =>
  SetMetadata(REQUIRED_VENDOR_CAPABILITY, capability);
