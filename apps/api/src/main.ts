import "dotenv/config";
import "reflect-metadata";
import "./telemetry";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { parseApiEnvironment } from "@weddingos/config";
import { apiRuntimeEnvironment } from "./common/runtime-environment";
import { AppModule } from "./app.module";
import { ProblemFilter } from "./common/problem.filter";
import { RequestLoggingInterceptor } from "./common/request-logging.interceptor";
import { StructuredLogger } from "./common/structured-logger";
import { applyOpenApiContracts } from "./openapi/openapi-contracts";
import { activeTraceId, shutdownTelemetry } from "./telemetry";

async function bootstrap() {
  const environment = parseApiEnvironment(apiRuntimeEnvironment());
  const application = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  if (environment.TRUST_PROXY_HOPS > 0)
    application
      .getHttpAdapter()
      .getInstance()
      .set("trust proxy", environment.TRUST_PROXY_HOPS);

  application.useLogger(new StructuredLogger());
  application.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          formAction: ["'self'", "https://accounts.google.com"],
        },
      },
    }),
  );
  application.use(cookieParser());
  application.use(
    (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader("Cache-Control", "no-store");
      const traceId = activeTraceId();
      if (traceId) response.setHeader("X-Trace-Id", traceId);
      next();
    },
  );
  application.enableCors({
    origin: [environment.WEB_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Idempotency-Key",
      "X-Request-Id",
      "X-Correlation-Id",
      "If-Match",
      "X-CSRF-Token",
      "X-Admin-Step-Up",
    ],
    exposedHeaders: ["X-Request-Id", "X-Correlation-Id", "X-Trace-Id", "ETag"],
  });
  application.useGlobalFilters(new ProblemFilter());
  application.useGlobalInterceptors(new RequestLoggingInterceptor());

  const openApiConfig = new DocumentBuilder()
    .setTitle("Sarbato API")
    .setDescription(
      "Sarbato API: product domains, platform administration, privacy and controlled production operations",
    )
    .setVersion("1.0")
    .addCookieAuth(environment.SESSION_COOKIE_NAME)
    .build();
  const document = applyOpenApiContracts(
    SwaggerModule.createDocument(application, openApiConfig),
  );
  SwaggerModule.setup("docs", application, document, {
    jsonDocumentUrl: "docs-json",
  });

  application.enableShutdownHooks();
  process.once("beforeExit", () => void shutdownTelemetry());
  await application.listen(environment.PORT, environment.BIND_HOST);
  Logger.log(
    JSON.stringify({
      event: "api.started",
      url: environment.API_URL,
      port: environment.PORT,
      environment: environment.NODE_ENV,
    }),
    "Bootstrap",
  );
}

void bootstrap();
