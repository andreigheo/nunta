export type ApiProblemPolicy =
  | "reauthenticate"
  | "forbidden"
  | "conflict"
  | "inline";

export function classifyApiProblem(status: number): ApiProblemPolicy {
  if (status === 401) return "reauthenticate";
  if (status === 403) return "forbidden";
  if (status === 409 || status === 412) return "conflict";
  return "inline";
}

export function isDemoCookieHeader(cookieHeader: string): boolean {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .includes("weddingos_demo=1");
}
