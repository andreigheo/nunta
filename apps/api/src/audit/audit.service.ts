import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@weddingos/database";
import type { SemanticEvent } from "@weddingos/contracts";
import { DatabaseService } from "../common/database.service";

type AuditInput = {
  action: SemanticEvent | string;
  actorUserId?: string;
  workspaceId?: string;
  entityType?: string;
  entityId?: string;
  outcome?: "SUCCESS" | "DENIED" | "FAILURE";
  metadata?: Record<string, string | number | boolean | null>;
  requestId?: string;
  correlationId?: string;
  ipAddress?: string;
};

@Injectable()
export class AuditService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async record(input: AuditInput): Promise<void> {
    await this.database.withContext(
      { userId: input.actorUserId, workspaceId: input.workspaceId },
      async (transaction) => {
        await transaction.auditEvent.create({
          data: {
            action: input.action,
            actorUserId: input.actorUserId,
            workspaceId: input.workspaceId,
            entityType: input.entityType,
            entityId: input.entityId,
            outcome: input.outcome ?? "SUCCESS",
            metadata: input.metadata as Prisma.InputJsonValue | undefined,
            requestId: input.requestId,
            correlationId: input.correlationId,
            ipAddress: input.ipAddress,
          },
        });
      },
    );
  }
}
