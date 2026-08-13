import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@weddingos/database";
import type { UpdateWorkspaceCreativeState } from "@weddingos/contracts";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";

@Injectable()
export class CreativeService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
  ) {}

  async get(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const state = await tx.workspaceCreativeState.findUnique({
        where: { workspaceId },
      });
      return state ? mapState(state) : emptyState(workspaceId);
    });
  }

  async update(
    userId: string,
    workspaceId: string,
    expectedVersion: number | null,
    input: UpdateWorkspaceCreativeState,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`creative:${workspaceId}`}, 0))`;
        const current = await tx.workspaceCreativeState.findUnique({
          where: { workspaceId },
        });
        if (current && expectedVersion !== current.version) {
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Creative workspace version conflict",
            "Conceptul a fost modificat în altă sesiune. Reîncarcă înainte de a salva.",
            undefined,
            { latestVersion: current.version },
          );
        }
        if (!current && expectedVersion !== null && expectedVersion !== 0) {
          problem(
            "VERSION_CONFLICT",
            HttpStatus.PRECONDITION_FAILED,
            "Creative workspace version conflict",
          );
        }
        const data = {
          conceptTitle: input.conceptTitle,
          conceptDescription: input.conceptDescription,
          palette: input.palette as Prisma.InputJsonValue,
          boards: input.boards as Prisma.InputJsonValue,
          updatedById: userId,
        };
        const state = current
          ? await tx.workspaceCreativeState.update({
              where: { id: current.id },
              data: { ...data, version: { increment: 1 } },
            })
          : await tx.workspaceCreativeState.create({
              data: {
                workspaceId,
                ...data,
                createdById: userId,
              },
            });
        await this.asyncEvents.record(tx, {
          eventName: "creative.state_updated.v1",
          aggregateType: "WorkspaceCreativeState",
          aggregateId: state.id,
          aggregateVersion: state.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `creative-state:${state.id}:v${state.version}`,
          payload: {
            subject: { stateId: state.id, version: state.version },
            activity: {
              category: "creative",
              action: "state_updated",
              summary:
                "Conceptul vizual și moodboardurile au fost actualizate.",
              entityType: "WorkspaceCreativeState",
              entityId: state.id,
            },
          },
        });
        return mapState(state);
      },
    );
  }
}

function mapState(state: {
  id: string;
  workspaceId: string;
  conceptTitle: string;
  conceptDescription: string;
  palette: Prisma.JsonValue;
  boards: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}) {
  return {
    id: state.id,
    workspaceId: state.workspaceId,
    conceptTitle: state.conceptTitle,
    conceptDescription: state.conceptDescription,
    palette: state.palette,
    boards: state.boards,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
    version: state.version,
  };
}

function emptyState(workspaceId: string) {
  return {
    id: null,
    workspaceId,
    conceptTitle: "",
    conceptDescription: "",
    palette: [],
    boards: [],
    createdAt: null,
    updatedAt: null,
    version: 0,
  };
}
