export const MARKETING_CAPABILITY_MANIFEST_VERSION = "1" as const;

export const marketingCapabilityManifest = {
  planning: {
    status: "implemented",
    requiredOperations: [
      "GET /api/v1/workspaces/{workspaceId}/dashboard",
      "GET /api/v1/workspaces/{workspaceId}/tasks",
    ],
  },
  rsvpAndLogistics: {
    status: "implemented",
    requiredOperations: [
      "GET /api/v1/workspaces/{workspaceId}/transport-requests",
      "GET /api/v1/workspaces/{workspaceId}/transport-plans",
      "GET /api/v1/workspaces/{workspaceId}/accommodation-requests",
      "GET /api/v1/workspaces/{workspaceId}/accommodation-stays",
    ],
  },
  procurementAndBudget: {
    status: "implemented",
    requiredOperations: [
      "GET /api/v1/workspaces/{workspaceId}/rfqs",
      "GET /api/v1/workspaces/{workspaceId}/budget",
    ],
  },
  weddingDay: {
    status: "implemented",
    requiredOperations: [
      "GET /api/v1/workspaces/{workspaceId}/wedding-day/plans",
      "GET /api/v1/workspaces/{workspaceId}/wedding-day/command-center",
    ],
  },
} as const;

export type MarketingCapabilityKey = keyof typeof marketingCapabilityManifest;
