import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { capabilityKeySchema, type CapabilityKey } from "@weddingos/contracts";
import { DatabaseService } from "../common/database.service";
import type { WeddingOsRequest } from "../common/http.types";
import { problem } from "../common/problem";
import { parseUuid } from "../common/validation";
import { REQUIRED_VENDOR_CAPABILITY } from "./vendor-capability.decorator";

@Injectable()
export class VendorCapabilityGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<CapabilityKey>(
      REQUIRED_VENDOR_CAPABILITY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<WeddingOsRequest>();
    if (!request.auth)
      problem(
        "UNAUTHENTICATED",
        HttpStatus.UNAUTHORIZED,
        "Authentication required",
      );
    const parameter = request.params.organizationId;
    const organizationId = parseUuid(
      Array.isArray(parameter) ? (parameter[0] ?? "") : (parameter ?? ""),
      "organizationId",
    );
    const authorization = await this.database.withContext(
      { userId: request.auth.userId, vendorOrganizationId: organizationId },
      async (transaction) => {
        const membership =
          await transaction.vendorOrganizationMembership.findFirst({
            where: {
              vendorOrganizationId: organizationId,
              userId: request.auth!.userId,
              status: "ACTIVE",
            },
          });
        if (!membership) return null;
        const [role, overrides, organization] = await Promise.all([
          transaction.vendorRoleTemplate.findUnique({
            where: { id: membership.roleTemplateId },
          }),
          transaction.vendorMembershipCapabilityOverride.findMany({
            where: { membershipId: membership.id },
          }),
          transaction.vendorOrganization.findUnique({
            where: { id: organizationId },
          }),
        ]);
        return { membership, role, overrides, organization };
      },
    );
    if (!authorization?.role || !authorization.organization)
      problem(
        "FORBIDDEN",
        HttpStatus.FORBIDDEN,
        "Vendor organization access denied",
      );
    if (authorization.organization.status === "SUSPENDED")
      problem("FORBIDDEN", HttpStatus.LOCKED, "Vendor organization suspended");

    const effective = new Set<CapabilityKey>();
    if (Array.isArray(authorization.role.capabilities)) {
      for (const value of authorization.role.capabilities) {
        const parsed = capabilityKeySchema.safeParse(value);
        if (parsed.success) effective.add(parsed.data);
      }
    }
    for (const override of authorization.overrides) {
      const parsed = capabilityKeySchema.safeParse(override.capability);
      if (!parsed.success) continue;
      if (override.effect === "ALLOW") effective.add(parsed.data);
      else effective.delete(parsed.data);
    }
    if (!effective.has(required))
      problem(
        "FORBIDDEN",
        HttpStatus.FORBIDDEN,
        "Vendor capability required",
        `Este necesară capabilitatea ${required}.`,
        undefined,
        { requiredCapability: required },
      );
    return true;
  }
}
