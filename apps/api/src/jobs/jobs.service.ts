import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";
import { basename, join, resolve } from "node:path";

@Injectable()
export class JobsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  async get(userId: string, jobId: string) {
    const job = await this.database.withContext({ userId }, (transaction) =>
      transaction.backgroundJob.findFirst({
        where: { id: jobId, actorUserId: userId, userVisible: true },
      }),
    );
    if (!job) {
      problem("JOB_NOT_FOUND", HttpStatus.NOT_FOUND, "Job not found");
    }
    return mapJob(job);
  }

  async artifact(userId: string, jobId: string) {
    const job = await this.get(userId, jobId);
    if (job.status !== "completed") {
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Artifact not found");
    }
    const artifact = await this.database.withContext(
      { userId, workspaceId: job.workspaceId ?? undefined },
      (transaction) =>
        transaction.generatedArtifact.findFirst({
          where: {
            backgroundJobId: jobId,
            ownerUserId: userId,
            status: "READY",
            deletedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
    );
    if (!artifact)
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Artifact not found");
    if (
      basename(artifact.storageKey) !== artifact.storageKey ||
      !/^[0-9a-f-]{36}\.(csv|xlsx|html)$/i.test(artifact.storageKey)
    )
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Artifact not found");
    const root = resolve(process.cwd(), this.environment.ARTIFACT_ROOT);
    return {
      path: join(root, artifact.storageKey),
      mediaType: artifact.mediaType,
      fileName: artifact.fileName,
    };
  }
}

export function mapJob(job: {
  id: string;
  workspaceId: string | null;
  type: string;
  status: string;
  progress: number;
  attempts: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  result: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  version: number;
}) {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    type: job.type,
    status: job.status.toLowerCase(),
    progress: job.progress,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    error:
      job.errorCode && job.errorMessage
        ? { code: job.errorCode, message: job.errorMessage }
        : null,
    result:
      job.result && typeof job.result === "object" && !Array.isArray(job.result)
        ? job.result
        : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    version: job.version,
  };
}
