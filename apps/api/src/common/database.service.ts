import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@weddingos/database";
import { PrismaClient } from "@weddingos/database";
import type { ApiEnvironment } from "@weddingos/config";
import { API_ENVIRONMENT } from "./environment.module";

export type TenantContext = {
  userId?: string;
  workspaceId?: string;
  vendorOrganizationId?: string;
  bootstrapWorkspaceId?: string;
  invitationTokenHash?: string;
  guestTokenHash?: string;
  guestAccessGrantId?: string;
  workerId?: string;
  jobId?: string;
  correlationId?: string;
  environment?: string;
};

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly runtimeEnvironment: string;
  private readonly databasePurpose: string;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    super({
      datasourceUrl: environment.DATABASE_URL,
      log:
        environment.NODE_ENV === "development"
          ? [{ emit: "event", level: "error" }]
          : undefined,
    });
    this.runtimeEnvironment = environment.NODE_ENV;
    this.databasePurpose = environment.DATABASE_PURPOSE;
  }

  async onModuleInit() {
    await this.$connect();
    const identity = await this.$queryRaw<
      Array<{ databasePurpose: string; environment: string }>
    >`SELECT database_purpose AS "databasePurpose", environment
      FROM database_identities WHERE id = 'singleton'`;
    if (
      identity[0]?.databasePurpose !== this.databasePurpose ||
      identity[0]?.environment !== this.runtimeEnvironment
    ) {
      await this.$disconnect();
      throw new Error(
        `DATABASE_IDENTITY_MISMATCH expected=${this.runtimeEnvironment}/${this.databasePurpose} actual=${identity[0]?.environment ?? "missing"}/${identity[0]?.databasePurpose ?? "missing"}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async isReady(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async withContext<T>(
    context: TenantContext,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (transaction) => {
      await this.setTransactionContext(transaction, context);
      return operation(transaction);
    });
  }

  async setTransactionContext(
    transaction: Prisma.TransactionClient,
    context: TenantContext,
  ): Promise<void> {
    await transaction.$executeRaw`
        SELECT
          set_config('app.current_user_id', ${context.userId ?? ""}, true),
          set_config('app.current_workspace_id', ${context.workspaceId ?? ""}, true),
          set_config('app.current_vendor_organization_id', ${context.vendorOrganizationId ?? ""}, true),
          set_config('app.current_bootstrap_workspace_id', ${context.bootstrapWorkspaceId ?? ""}, true),
          set_config('app.current_invitation_token_hash', ${context.invitationTokenHash ?? ""}, true),
          set_config('app.current_guest_token_hash', ${context.guestTokenHash ?? ""}, true),
          set_config('app.current_guest_access_grant_id', ${context.guestAccessGrantId ?? ""}, true),
          set_config('app.current_worker_id', ${context.workerId ?? ""}, true),
          set_config('app.current_job_id', ${context.jobId ?? ""}, true),
          set_config('app.current_correlation_id', ${context.correlationId ?? ""}, true)
          ,set_config('app.environment', ${context.environment ?? this.runtimeEnvironment}, true)
      `;
  }

  async withWorkerContext<T>(
    context: Required<
      Pick<TenantContext, "workerId" | "jobId" | "correlationId">
    > &
      Pick<TenantContext, "userId" | "workspaceId">,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.withContext(context, operation);
  }
}
