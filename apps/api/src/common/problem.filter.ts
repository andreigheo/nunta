import type { ArgumentsHost } from "@nestjs/common";
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import { Prisma } from "@weddingos/database";
import type { Response } from "express";
import type { ApiProblemCode } from "@weddingos/contracts";
import type { WeddingOsRequest } from "./http.types";
import { ProblemException } from "./problem";

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<WeddingOsRequest>();
    const response = context.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ApiProblemCode = "INTERNAL_ERROR";
    let title = "Internal server error";
    let detail = "Cererea nu a putut fi procesată.";
    let fieldErrors: Record<string, string[]> | undefined;
    let latestVersion: number | undefined;
    let requiredCapability: string | undefined;
    let purpose: string | undefined;

    if (exception instanceof ProblemException) {
      status = exception.getStatus();
      code = exception.code;
      title = exception.problemTitle;
      detail = exception.detail ?? detail;
      fieldErrors = exception.fieldErrors;
      latestVersion = exception.metadata?.latestVersion;
      requiredCapability = exception.metadata?.requiredCapability;
      purpose = exception.metadata?.purpose;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        code = "NOT_FOUND";
        title = "Resource not found";
      } else if (exception.code === "P2002") {
        status = HttpStatus.CONFLICT;
        code = "VERSION_CONFLICT";
        title = "Resource conflict";
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status === HttpStatus.TOO_MANY_REQUESTS) code = "RATE_LIMITED";
      title = exception.name;
      detail =
        typeof exception.message === "string" ? exception.message : detail;
    }

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          event: "http.error",
          requestId: request.requestId,
          correlationId: request.correlationId,
          method: request.method,
          path: request.originalUrl,
          errorName:
            exception instanceof Error ? exception.name : "UnknownError",
          message:
            exception instanceof Error ? exception.message : "Unknown error",
        }),
      );
    }

    response
      .status(status)
      .type("application/problem+json")
      .send({
        type: `https://weddingos.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
        title,
        status,
        code,
        detail,
        requestId: request.requestId,
        ...(fieldErrors ? { fieldErrors } : {}),
        ...(latestVersion ? { latestVersion } : {}),
        ...(requiredCapability ? { requiredCapability } : {}),
        ...(purpose ? { purpose } : {}),
      });
  }
}
