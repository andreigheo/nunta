import { context, propagation, trace, type Span } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

const enabled = process.env.OTEL_TRACING_ENABLED === "true";
let sdk: NodeSDK | undefined;

if (enabled) {
  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "weddingos-api",
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

export const weddingOsTracer = trace.getTracer("weddingos-api", "10c");

export function currentTraceCarrier() {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return {
    ...(carrier.traceparent ? { traceparent: carrier.traceparent } : {}),
    ...(carrier.tracestate ? { tracestate: carrier.tracestate } : {}),
  };
}

export function activeTraceId() {
  return trace.getActiveSpan()?.spanContext().traceId;
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
