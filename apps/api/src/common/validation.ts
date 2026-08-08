import { HttpStatus } from "@nestjs/common";
import { z } from "zod";
import { ProblemException } from "./problem";

export function parseWithSchema<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "request";
    fieldErrors[path] ??= [];
    fieldErrors[path].push(issue.message);
  }
  throw new ProblemException(
    "VALIDATION_FAILED",
    HttpStatus.BAD_REQUEST,
    "Validation failed",
    "Cererea conține valori invalide.",
    fieldErrors,
  );
}

export function parseUuid(value: string, field = "id"): string {
  return parseWithSchema(
    z.string().uuid({ message: `${field} trebuie să fie un UUID valid.` }),
    value || undefined,
  );
}
