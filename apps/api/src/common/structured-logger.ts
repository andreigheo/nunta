import type { LoggerService } from "@nestjs/common";

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export class StructuredLogger implements LoggerService {
  log(message: unknown, context?: string) {
    this.write("info", message, context);
  }

  error(message: unknown, _stack?: string, context?: string) {
    this.write("error", message, context);
  }

  warn(message: unknown, context?: string) {
    this.write("warn", message, context);
  }

  debug(message: unknown, context?: string) {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write("debug", message, context);
  }

  fatal(message: unknown, context?: string) {
    this.write("fatal", message, context);
  }

  private write(level: LogLevel, message: unknown, context?: string) {
    const parsed = parseStructuredMessage(message);
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      ...(context ? { context } : {}),
      ...parsed,
    });
    if (level === "error" || level === "fatal")
      process.stderr.write(`${entry}\n`);
    else process.stdout.write(`${entry}\n`);
  }
}

function parseStructuredMessage(message: unknown): Record<string, unknown> {
  if (typeof message === "string") {
    try {
      const parsed = JSON.parse(message) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ordinary Nest lifecycle messages remain structured under `message`.
    }
    return { message };
  }
  if (message && typeof message === "object" && !Array.isArray(message)) {
    return { message: sanitizeObject(message as Record<string, unknown>) };
  }
  return { message: String(message) };
}

function sanitizeObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !/(password|secret|token|cookie|authorization)/i.test(key),
    ),
  );
}
