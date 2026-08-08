import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Context,
  type Span,
} from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

const enabled = process.env.OTEL_TRACING_ENABLED === "true";
let sdk: NodeSDK | undefined;

if (enabled) {
  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "weddingos-worker",
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
        "http://127.0.0.1:4318/v1/traces",
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-http": {
          requestHook: redactUrlAttributes,
        },
      }),
    ],
  });
  sdk.start();
}

const tracer = trace.getTracer("weddingos-worker", "10c");

export function extractedTraceContext(carrier: unknown): Context {
  if (!carrier || typeof carrier !== "object" || Array.isArray(carrier))
    return ROOT_CONTEXT;
  const safeCarrier = Object.fromEntries(
    Object.entries(carrier).filter(
      ([key, value]) =>
        (key === "traceparent" || key === "tracestate") &&
        typeof value === "string",
    ),
  );
  return propagation.extract(ROOT_CONTEXT, safeCarrier);
}

export async function withConsumerTrace<T>(
  parent: Context,
  attributes: Record<string, string>,
  operation: () => Promise<T>,
) {
  return context.with(parent, () =>
    tracer.startActiveSpan(
      "worker.outbox.consume",
      { attributes },
      async (span) => {
        try {
          const result = await operation();
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    ),
  );
}

export async function shutdownTelemetry() {
  await sdk?.shutdown();
}

function redactUrlAttributes(span: Span) {
  span.setAttribute("weddingos.trace_privacy", "redacted");
  const mutableSpan = span as Span & {
    deleteAttribute?: (key: string) => void;
  };
  for (const key of [
    "http.url",
    "http.target",
    "url.full",
    "url.query",
    "http.request.body",
    "http.request.header.authorization",
    "http.request.header.cookie",
  ]) {
    mutableSpan.deleteAttribute?.(key);
  }
}
