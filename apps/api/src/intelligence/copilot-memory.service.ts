import { createHash } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  CreateCopilotMemory,
  copilotMemoryKindSchema,
} from "@weddingos/contracts";
import type { ApiEnvironment } from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import {
  copilotMemoryContentCanPersist,
  requestCopilotEmbedding,
} from "@weddingos/jobs";
import { API_ENVIRONMENT } from "../common/environment.module";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";

type MemoryKind = (typeof copilotMemoryKindSchema)["_output"];
type MemoryUpdate = {
  title?: string;
  content?: string;
  subjectType?: string | null;
  subjectId?: string | null;
  kind?: MemoryKind;
  confidence?: number;
  confirmedByUser?: boolean;
  sensitivity?: "NORMAL" | "SENSITIVE";
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
  version: number;
};

export function enabledCopilotWebResearch(
  requested: boolean | undefined,
  available: boolean,
) {
  return requested === true && available;
}

@Injectable()
export class CopilotMemoryService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  private webResearchAvailable() {
    return (
      this.environment.COPILOT_EXTERNAL_ENABLED &&
      this.environment.COPILOT_EXTERNAL_DATA_ALLOWED &&
      this.environment.COPILOT_PROVIDER_PROTOCOL === "openrouter-chat"
    );
  }

  private settingsResource(
    settings: Parameters<typeof mapSettings>[0] | null,
    workspaceId: string,
  ) {
    const webResearchAvailable = this.webResearchAvailable();
    const persisted = settings
      ? mapSettings(settings)
      : defaultSettings(workspaceId);
    return {
      ...persisted,
      // Availability is a platform control; enablement remains an explicit
      // workspace choice and is forced off whenever the platform disallows it.
      webResearchEnabled: enabledCopilotWebResearch(
        persisted.webResearchEnabled,
        webResearchAvailable,
      ),
      webResearchAvailable,
    };
  }

  settings(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const settings = await tx.copilotWorkspaceSettings.findUnique({
        where: { workspaceId },
      });
      return this.settingsResource(settings, workspaceId);
    });
  }

  updateSettings(
    userId: string,
    workspaceId: string,
    input: {
      memoryEnabled?: boolean;
      webResearchEnabled?: boolean;
      proactiveSuggestions?: boolean;
      memoryRetentionDays?: number;
      version: number;
    },
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${"copilot.settings:" + workspaceId}, 0))
      `;
      const current = await tx.copilotWorkspaceSettings.findUnique({
        where: { workspaceId },
      });
      if (!current) {
        if (input.version !== 1) versionConflict();
        return this.settingsResource(
          await tx.copilotWorkspaceSettings.create({
            data: {
              workspaceId,
              memoryEnabled: input.memoryEnabled,
              webResearchEnabled: enabledCopilotWebResearch(
                input.webResearchEnabled,
                this.webResearchAvailable(),
              ),
              proactiveSuggestions: input.proactiveSuggestions,
              memoryRetentionDays: input.memoryRetentionDays,
              createdById: userId,
              updatedById: userId,
            },
          }),
          workspaceId,
        );
      }
      if (current.version !== input.version) versionConflict(current.version);
      const updated = await tx.copilotWorkspaceSettings.updateMany({
        where: { id: current.id, version: input.version },
        data: {
          memoryEnabled: input.memoryEnabled,
          webResearchEnabled: enabledCopilotWebResearch(
            input.webResearchEnabled,
            this.webResearchAvailable(),
          ),
          proactiveSuggestions: input.proactiveSuggestions,
          memoryRetentionDays: input.memoryRetentionDays,
          updatedById: userId,
          version: { increment: 1 },
        },
      });
      if (!updated.count) {
        const latest = await tx.copilotWorkspaceSettings.findUnique({
          where: { id: current.id },
          select: { version: true },
        });
        versionConflict(latest?.version);
      }
      return this.settingsResource(
        await tx.copilotWorkspaceSettings.findUniqueOrThrow({
          where: { id: current.id },
        }),
        workspaceId,
      );
    });
  }

  list(
    userId: string,
    workspaceId: string,
    query: {
      kind?: MemoryKind;
      scope?: "WORKSPACE" | "USER";
      status: "ACTIVE" | "SUPERSEDED" | "DELETED";
      cursor?: string;
    },
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.copilotMemory.findMany({
        where: {
          workspaceId,
          status: query.status,
          ...(query.kind ? { kind: query.kind } : {}),
          ...(query.scope ? { scope: query.scope } : {}),
          OR: [{ scope: "WORKSPACE" }, { scope: "USER", ownerUserId: userId }],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 31,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      return {
        items: rows.slice(0, 30).map(mapMemory),
        nextCursor: rows.length > 30 ? rows[29]!.id : null,
      };
    });
  }

  async create(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateCopilotMemory,
  ) {
    await this.ensureMemoryEnabled(userId, workspaceId);
    assertMemoryContentAllowed(input);
    const persisted = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${"copilot.memory.create:" + userId + ":" + idempotencyKey}, 0))
        `;
        const existing = await tx.idempotencyRecord.findUnique({
          where: {
            actorUserId_operation_key: {
              actorUserId: userId,
              operation: "copilot.memory.create",
              key: idempotencyKey,
            },
          },
        });
        const requestHash = hashJson(input);
        if (existing) {
          if (existing.requestHash !== requestHash)
            problem(
              "IDEMPOTENCY_CONFLICT",
              HttpStatus.CONFLICT,
              "Cheia idempotentă a fost folosită pentru altă memorie.",
            );
          return existing.responseBody as ReturnType<typeof mapMemory>;
        }
        const created = await tx.copilotMemory.create({
          data: {
            workspaceId,
            scope: input.scope,
            ownerUserId: input.scope === "USER" ? userId : null,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            kind: input.kind,
            title: input.title,
            content: input.content,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            confidence: input.confidence,
            confirmedByUser: input.confirmedByUser,
            sensitivity: input.sensitivity,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            metadata: input.metadata as Prisma.InputJsonValue,
            createdById: userId,
            updatedById: userId,
          },
        });
        const response = mapMemory(created);
        await tx.idempotencyRecord.create({
          data: {
            workspaceId,
            actorUserId: userId,
            operation: "copilot.memory.create",
            key: idempotencyKey,
            requestHash,
            responseStatus: 201,
            responseBody: response as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
        return response;
      },
    );
    const embeddingStatus = await this.refreshEmbedding(
      userId,
      workspaceId,
      persisted.id,
      persisted.title,
      persisted.content,
      persisted.sensitivity,
    );
    return { ...persisted, embeddingStatus };
  }

  async update(
    userId: string,
    workspaceId: string,
    memoryId: string,
    input: MemoryUpdate,
    canManageWorkspaceMemory: boolean,
  ) {
    await this.ensureMemoryEnabled(userId, workspaceId);
    const memory = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        await lockMemory(tx, memoryId);
        const current = await tx.copilotMemory.findFirst({
          where: {
            id: memoryId,
            workspaceId,
            status: "ACTIVE",
            OR: [
              { scope: "WORKSPACE" },
              { scope: "USER", ownerUserId: userId },
            ],
          },
        });
        if (!current) memoryNotFound();
        assertCanManageMemory(current.scope, canManageWorkspaceMemory);
        if (current.version !== input.version) versionConflict(current.version);
        assertMemoryContentAllowed({
          title: input.title ?? current.title,
          content: input.content ?? current.content,
          metadata: input.metadata ?? current.metadata,
        });
        const updated = await tx.copilotMemory.updateMany({
          where: {
            id: current.id,
            workspaceId,
            version: input.version,
            status: "ACTIVE",
          },
          data: {
            title: input.title,
            content: input.content,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            kind: input.kind,
            confidence: input.confidence,
            confirmedByUser: input.confirmedByUser,
            sensitivity: input.sensitivity,
            expiresAt:
              input.expiresAt === undefined
                ? undefined
                : input.expiresAt
                  ? new Date(input.expiresAt)
                  : null,
            metadata: input.metadata as Prisma.InputJsonValue | undefined,
            updatedById: userId,
            version: { increment: 1 },
          },
        });
        if (!updated.count) {
          const latest = await tx.copilotMemory.findFirst({
            where: { id: current.id, workspaceId },
            select: { version: true },
          });
          versionConflict(latest?.version);
        }
        return tx.copilotMemory.findUniqueOrThrow({
          where: { id: current.id },
        });
      },
    );
    const embeddingStatus = await this.refreshEmbedding(
      userId,
      workspaceId,
      memory.id,
      memory.title,
      memory.content,
      memory.sensitivity,
    );
    return { ...mapMemory(memory), embeddingStatus };
  }

  remove(
    userId: string,
    workspaceId: string,
    memoryId: string,
    expectedVersion: number,
    canManageWorkspaceMemory: boolean,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await lockMemory(tx, memoryId);
      const current = await tx.copilotMemory.findFirst({
        where: {
          id: memoryId,
          workspaceId,
          status: "ACTIVE",
          OR: [{ scope: "WORKSPACE" }, { scope: "USER", ownerUserId: userId }],
        },
      });
      if (!current) memoryNotFound();
      assertCanManageMemory(current.scope, canManageWorkspaceMemory);
      if (current.version !== expectedVersion) versionConflict(current.version);
      await tx.copilotMemoryEmbedding.deleteMany({
        where: { workspaceId, memoryId },
      });
      const removed = await tx.copilotMemory.updateMany({
        where: {
          id: memoryId,
          workspaceId,
          version: expectedVersion,
          status: "ACTIVE",
        },
        data: {
          status: "DELETED",
          deletedAt: new Date(),
          updatedById: userId,
          version: { increment: 1 },
        },
      });
      if (!removed.count) {
        const latest = await tx.copilotMemory.findFirst({
          where: { id: memoryId, workspaceId },
          select: { version: true },
        });
        versionConflict(latest?.version);
      }
      return mapMemory(
        await tx.copilotMemory.findUniqueOrThrow({ where: { id: memoryId } }),
      );
    });
  }

  async search(
    userId: string,
    workspaceId: string,
    input: { query: string; kinds: MemoryKind[]; limit: number },
  ) {
    const settings = await this.settings(userId, workspaceId);
    if (!settings.memoryEnabled)
      return { items: [], mode: "disabled" as const };
    const embedding = await this.embedding(input.query);
    const items = embedding
      ? await this.semanticSearch(userId, workspaceId, input, embedding)
      : await this.lexicalSearch(userId, workspaceId, input);
    if (items.length) {
      await this.database.withContext({ userId, workspaceId }, (tx) =>
        tx.copilotMemory.updateMany({
          where: { workspaceId, id: { in: items.map((item) => item.id) } },
          data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
        }),
      );
    }
    return {
      items,
      mode: embedding ? ("semantic" as const) : ("lexical" as const),
    };
  }

  private async ensureMemoryEnabled(userId: string, workspaceId: string) {
    const settings = await this.settings(userId, workspaceId);
    if (!settings.memoryEnabled)
      problem(
        "FEATURE_DISABLED",
        HttpStatus.CONFLICT,
        "Memoria Copilot este dezactivată",
        "Activează memoria din setările Copilot înainte de a salva informații.",
      );
  }

  private async refreshEmbedding(
    userId: string,
    workspaceId: string,
    memoryId: string,
    title: string,
    content: string,
    sensitivity: "NORMAL" | "SENSITIVE" | "RESTRICTED",
  ) {
    if (sensitivity !== "NORMAL") {
      const current = await this.database.withContext(
        { userId, workspaceId },
        async (tx) => {
          await lockMemory(tx, memoryId);
          const latest = await tx.copilotMemory.findFirst({
            where: { id: memoryId, workspaceId, status: "ACTIVE" },
            select: { title: true, content: true, sensitivity: true },
          });
          if (
            !latest ||
            latest.title !== title ||
            latest.content !== content ||
            latest.sensitivity === "NORMAL"
          )
            return false;
          await tx.copilotMemoryEmbedding.deleteMany({
            where: { workspaceId, memoryId },
          });
          return true;
        },
      );
      return current
        ? ("excluded_sensitive" as const)
        : ("superseded" as const);
    }
    const text = `${title}\n${content}`;
    const embedding = await this.embedding(text);
    if (!embedding) return "unavailable" as const;
    const vector = `[${embedding.join(",")}]`;
    const contentHash = createHash("sha256").update(text).digest("hex");
    const persisted = await this.database.withContext(
      { userId, workspaceId },
      async (tx) => {
        await lockMemory(tx, memoryId);
        const current = await tx.copilotMemory.findFirst({
          where: { id: memoryId, workspaceId, status: "ACTIVE" },
          select: { title: true, content: true, sensitivity: true },
        });
        if (
          !current ||
          current.title !== title ||
          current.content !== content ||
          current.sensitivity !== "NORMAL"
        )
          return false;
        await tx.$executeRaw`
        INSERT INTO copilot_memory_embeddings
          (workspace_id, memory_id, model, dimensions, content_hash, embedding)
        VALUES
          (${workspaceId}::uuid, ${memoryId}::uuid, ${this.environment.COPILOT_EMBEDDING_MODEL}, 1536, ${contentHash}, ${vector}::vector)
        ON CONFLICT (memory_id) DO UPDATE SET
          model = EXCLUDED.model,
          dimensions = EXCLUDED.dimensions,
          content_hash = EXCLUDED.content_hash,
          embedding = EXCLUDED.embedding,
          updated_at = CURRENT_TIMESTAMP
      `;
        return true;
      },
    );
    return persisted ? ("ready" as const) : ("superseded" as const);
  }

  private async embedding(input: string): Promise<number[] | null> {
    if (
      !this.environment.COPILOT_EMBEDDING_ENABLED ||
      !this.environment.COPILOT_EMBEDDING_API_KEY
    )
      return null;
    return requestCopilotEmbedding({
      endpoint: this.environment.COPILOT_EMBEDDING_ENDPOINT,
      apiKey: this.environment.COPILOT_EMBEDDING_API_KEY,
      model: this.environment.COPILOT_EMBEDDING_MODEL,
      text: input,
    });
  }

  private semanticSearch(
    userId: string,
    workspaceId: string,
    input: { query: string; kinds: MemoryKind[]; limit: number },
    embedding: number[],
  ) {
    const vector = `[${embedding.join(",")}]`;
    const kinds = input.kinds.length ? input.kinds : null;
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.$queryRaw<Array<SemanticMemoryRow>>`
        SELECT
          memory.id,
          memory.workspace_id AS "workspaceId",
          memory.scope::text,
          memory.owner_user_id AS "ownerUserId",
          memory.subject_type AS "subjectType",
          memory.subject_id AS "subjectId",
          memory.kind::text,
          memory.title,
          memory.content,
          memory.source_type::text AS "sourceType",
          memory.source_id AS "sourceId",
          memory.confidence::float8,
          memory.confirmed_by_user AS "confirmedByUser",
          memory.sensitivity::text,
          memory.status::text,
          memory.metadata,
          memory.expires_at AS "expiresAt",
          memory.last_used_at AS "lastUsedAt",
          memory.use_count AS "useCount",
          memory.deleted_at AS "deletedAt",
          memory.created_at AS "createdAt",
          memory.updated_at AS "updatedAt",
          memory.version,
          1 - (embedding.embedding <=> ${vector}::vector) AS score
        FROM copilot_memories memory
        JOIN copilot_memory_embeddings embedding ON embedding.memory_id = memory.id
        WHERE memory.workspace_id = ${workspaceId}::uuid
          AND memory.status = 'ACTIVE'
          AND memory.sensitivity = 'NORMAL'
          AND (memory.expires_at IS NULL OR memory.expires_at > CURRENT_TIMESTAMP)
          AND (memory.scope = 'WORKSPACE' OR memory.owner_user_id = ${userId}::uuid)
          AND (${kinds}::text[] IS NULL OR memory.kind::text = ANY(${kinds}::text[]))
        ORDER BY embedding.embedding <=> ${vector}::vector, memory.updated_at DESC
        LIMIT ${input.limit}
      `;
      return rows.map((row) => ({ ...mapMemory(row), score: row.score }));
    });
  }

  private lexicalSearch(
    userId: string,
    workspaceId: string,
    input: { query: string; kinds: MemoryKind[]; limit: number },
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.copilotMemory.findMany({
        where: {
          workspaceId,
          status: "ACTIVE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          ...(input.kinds.length ? { kind: { in: input.kinds } } : {}),
          AND: [
            {
              OR: [
                { scope: "WORKSPACE" },
                { scope: "USER", ownerUserId: userId },
              ],
            },
            {
              OR: [
                { title: { contains: input.query, mode: "insensitive" } },
                { content: { contains: input.query, mode: "insensitive" } },
              ],
            },
          ],
        },
        orderBy: [{ confirmedByUser: "desc" }, { updatedAt: "desc" }],
        take: input.limit,
      });
      return rows.map((row) => ({ ...mapMemory(row), score: null }));
    });
  }
}

function assertCanManageMemory(
  scope: "WORKSPACE" | "USER",
  canManageWorkspaceMemory: boolean,
) {
  if (scope === "WORKSPACE" && !canManageWorkspaceMemory)
    problem(
      "FORBIDDEN",
      HttpStatus.FORBIDDEN,
      "Nu ai permisiunea de a modifica memoria comună a echipei.",
    );
}

type SemanticMemoryRow = {
  id: string;
  workspaceId: string;
  scope: string;
  ownerUserId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  kind: string;
  title: string;
  content: string;
  sourceType: string;
  sourceId: string | null;
  confidence: number;
  confirmedByUser: boolean;
  sensitivity: string;
  status: string;
  metadata: unknown;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  useCount: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  score: number;
};

function mapSettings(settings: {
  id: string;
  workspaceId: string;
  memoryEnabled: boolean;
  webResearchEnabled: boolean;
  proactiveSuggestions: boolean;
  memoryRetentionDays: number;
  version: number;
  updatedAt: Date;
}) {
  return {
    id: settings.id,
    workspaceId: settings.workspaceId,
    memoryEnabled: settings.memoryEnabled,
    webResearchEnabled: settings.webResearchEnabled,
    proactiveSuggestions: settings.proactiveSuggestions,
    memoryRetentionDays: settings.memoryRetentionDays,
    version: settings.version,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function defaultSettings(workspaceId: string) {
  return {
    id: null,
    workspaceId,
    memoryEnabled: true,
    webResearchEnabled: false,
    proactiveSuggestions: true,
    memoryRetentionDays: 180,
    version: 1,
    updatedAt: null,
  };
}

function mapMemory(memory: SemanticMemoryRow | Record<string, unknown>) {
  const item = memory as SemanticMemoryRow;
  return {
    id: item.id,
    workspaceId: item.workspaceId,
    scope: item.scope as "WORKSPACE" | "USER",
    ownerUserId: item.ownerUserId,
    subjectType: item.subjectType,
    subjectId: item.subjectId,
    kind: item.kind as MemoryKind,
    title: item.title,
    content: item.content,
    sourceType: item.sourceType as
      | "USER_CONFIRMED"
      | "CANONICAL_RESOURCE"
      | "CONVERSATION"
      | "DOCUMENT"
      | "WEB"
      | "SYSTEM",
    sourceId: item.sourceId,
    confidence: Number(item.confidence),
    confirmedByUser: item.confirmedByUser,
    sensitivity: item.sensitivity as "NORMAL" | "SENSITIVE" | "RESTRICTED",
    status: item.status as "ACTIVE" | "SUPERSEDED" | "DELETED",
    metadata: item.metadata,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
    useCount: item.useCount,
    deletedAt: item.deletedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    version: item.version,
  };
}

function memoryNotFound(): never {
  return problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Memoria nu a fost găsită");
}

function versionConflict(latestVersion?: number): never {
  return problem(
    "VERSION_CONFLICT",
    HttpStatus.PRECONDITION_FAILED,
    "Memoria sau setările s-au schimbat",
    "Reîncarcă datele și încearcă din nou.",
    undefined,
    latestVersion ? { latestVersion } : undefined,
  );
}

function assertMemoryContentAllowed(value: unknown) {
  if (!copilotMemoryContentCanPersist(value))
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Această informație nu poate fi păstrată în memoria Copilot.",
      "Parolele, tokenurile, datele de plată și informațiile medicale sau despre alergii rămân în afara memoriei semantice.",
    );
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function lockMemory(tx: Prisma.TransactionClient, memoryId: string) {
  return tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${"copilot.memory:" + memoryId}, 0))
  `;
}
