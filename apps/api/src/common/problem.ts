import type { HttpStatus } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import type { ApiProblemCode } from "@weddingos/contracts";
import type { CapabilityKey } from "@weddingos/contracts";

export type ProblemMetadata = {
  latestVersion?: number;
  requiredCapability?: CapabilityKey;
  purpose?: string;
};

export class ProblemException extends HttpException {
  constructor(
    public readonly code: ApiProblemCode,
    status: HttpStatus,
    public readonly problemTitle: string,
    public readonly detail?: string,
    public readonly fieldErrors?: Record<string, string[]>,
    public readonly metadata?: ProblemMetadata,
  ) {
    super(detail ?? problemTitle, status);
  }
}

export function problem(
  code: ApiProblemCode,
  status: HttpStatus,
  title: string,
  detail?: string,
  fieldErrors?: Record<string, string[]>,
  metadata?: ProblemMetadata,
): never {
  throw new ProblemException(
    code,
    status,
    title,
    detail,
    fieldErrors,
    metadata,
  );
}
