import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "./database.service";

type SecuritySignal = {
  type: string;
  subject?: string;
  targetType?: string;
  target?: string;
  correlationId?: string;
  context?: Record<string, string | number | boolean | null>;
  threshold?: number;
  windowSeconds?: number;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

@Injectable()
export class SecurityDetectionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async record(input: SecuritySignal) {
    const windowSeconds = Math.max(
      30,
      Math.min(input.windowSeconds ?? 600, 86_400),
    );
    const threshold = Math.max(1, Math.min(input.threshold ?? 5, 1000));
    const actorHash = input.subject ? this.hash(input.subject) : null;
    const targetHash = input.target ? this.hash(input.target) : null;
    const dedupeKey = this.hash(
      `${input.type}:${actorHash ?? "global"}:${targetHash ?? "none"}`,
    );
    const rows = await this.database.$queryRaw<
      Array<{ result: { alerted: boolean; count: number; alertId?: string } }>
    >`
      SELECT public.weddingos_record_security_signal(
        ${input.type}::text, ${input.severity ?? "MEDIUM"}::text, ${dedupeKey}::text, ${actorHash}::text,
        ${input.targetType ?? null}::text, ${targetHash}::text, ${input.context ?? {}}::jsonb,
        ${input.correlationId ?? null}::text, ${threshold}::integer, ${windowSeconds}::integer
      ) AS result`;
    return rows[0]?.result ?? { alerted: false, count: 0 };
  }

  private hash(value: string) {
    return createHash("sha256")
      .update(value.trim().toLowerCase())
      .digest("hex");
  }
}
