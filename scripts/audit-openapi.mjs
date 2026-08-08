const documentUrl =
  process.env.OPENAPI_URL ?? "http://127.0.0.1:4000/docs-json";
const document = await fetch(documentUrl).then((response) => {
  if (!response.ok) throw new Error(`OpenAPI returned HTTP ${response.status}`);
  return response.json();
});

const methods = ["get", "post", "put", "patch", "delete"];
const operations = [];
for (const [path, item] of Object.entries(document.paths)) {
  for (const method of methods) {
    if (item[method])
      operations.push({ path, method, operation: item[method] });
  }
}

// Canonical 29-path/34-operation inventory recorded in the Slice 0/1 handoff.
const baselineOperations = new Set([
  "GET /health",
  "GET /ready",
  "POST /api/v1/auth/registrations",
  "POST /api/v1/auth/sessions",
  "DELETE /api/v1/auth/session",
  "GET /api/v1/me",
  "POST /api/v1/auth/magic-link-requests",
  "POST /api/v1/auth/magic-link-exchanges",
  "POST /api/v1/auth/email-verification-requests",
  "POST /api/v1/auth/email-verifications",
  "POST /api/v1/auth/password-reset-requests",
  "POST /api/v1/auth/password-resets",
  "GET /api/v1/me/sessions",
  "DELETE /api/v1/me/sessions/{sessionId}",
  "PATCH /api/v1/me",
  "GET /api/v1/me/preferences",
  "PATCH /api/v1/me/preferences",
  "GET /api/v1/workspaces",
  "POST /api/v1/workspaces",
  "PATCH /api/v1/workspaces/{workspaceId}",
  "GET /api/v1/workspaces/{workspaceId}/members",
  "POST /api/v1/workspaces/{workspaceId}/team-invitations",
  "GET /api/v1/team-invitations/{token}",
  "POST /api/v1/team-invitations/{token}/accept",
  "POST /api/v1/team-invitations/{token}/decline",
  "POST /api/v1/workspaces/{workspaceId}/team-invitations/{invitationId}/resend",
  "DELETE /api/v1/workspaces/{workspaceId}/team-invitations/{invitationId}",
  "PATCH /api/v1/workspaces/{workspaceId}/members/{memberId}",
  "DELETE /api/v1/workspaces/{workspaceId}/members/{memberId}",
  "GET /api/v1/workspaces/{workspaceId}/bootstrap",
  "GET /api/v1/me/notification-preferences",
  "PATCH /api/v1/me/notification-preferences",
  "POST /api/v1/me/mfa-challenges",
  "POST /api/v1/me/mfa-verifications",
]);

const addedOperations = operations
  .map(({ method, path }) => `${method.toUpperCase()} ${path}`)
  .filter((operation) => !baselineOperations.has(operation))
  .sort();
const addedPaths = [...new Set(addedOperations.map(stripMethod))].sort();

const emptySchemas = [];
for (const [name, schema] of Object.entries(
  document.components?.schemas ?? {},
)) {
  const meaningful = Boolean(
    schema.$ref ||
    schema.oneOf ||
    schema.anyOf ||
    schema.allOf ||
    schema.enum ||
    schema.const ||
    schema.items ||
    (schema.properties && Object.keys(schema.properties).length > 0) ||
    schema.additionalProperties ||
    schema.type !== "object",
  );
  if (!meaningful) emptySchemas.push(name);
}

const noBodyOperations = new Set([
  "POST /api/v1/team-invitations/{token}/accept",
  "POST /api/v1/team-invitations/{token}/decline",
  "POST /api/v1/workspaces/{workspaceId}/team-invitations/{invitationId}/resend",
  "POST /api/v1/workspaces/{workspaceId}/notifications/mark-all-read",
  "POST /api/v1/workspaces/{workspaceId}/onboarding/complete",
]);
const missingContracts = [];
for (const { path, method, operation } of operations) {
  const label = `${method.toUpperCase()} ${path}`;
  const parameters = [
    ...(document.paths[path].parameters ?? []),
    ...(operation.parameters ?? []),
  ];
  for (const parameter of parameters) {
    if (!parameter.schema && !parameter.content)
      missingContracts.push(`${label} parameter:${parameter.name}`);
  }
  if (
    ["post", "put", "patch"].includes(method) &&
    !noBodyOperations.has(label) &&
    !operation.requestBody
  )
    missingContracts.push(`${label} requestBody`);
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (status === "204") continue;
    if (
      !response.content ||
      !Object.values(response.content).some((media) => media.schema)
    )
      missingContracts.push(`${label} response:${status}`);
  }
  if (
    !Object.keys(operation.responses ?? {}).some(
      (status) => Number(status) >= 400,
    )
  )
    missingContracts.push(`${label} error-response`);
}

const result = {
  documentUrl,
  paths: Object.keys(document.paths).length,
  operations: operations.length,
  schemas: Object.keys(document.components?.schemas ?? {}).length,
  baselinePaths: new Set([...baselineOperations].map(stripMethod)).size,
  baselineOperations: baselineOperations.size,
  addedPaths,
  addedOperations,
  emptySchemas,
  missingContracts,
};
console.log(JSON.stringify(result, null, 2));
if (
  result.paths !== 39 ||
  result.operations !== 46 ||
  result.baselinePaths !== 29 ||
  result.baselineOperations !== 34 ||
  addedPaths.length !== 10 ||
  addedOperations.length !== 12 ||
  emptySchemas.length > 0 ||
  missingContracts.length > 0
)
  process.exitCode = 1;

function stripMethod(operation) {
  return operation.slice(operation.indexOf(" ") + 1);
}
