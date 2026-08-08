import type { ApiResponse } from "@weddingos/contracts";
import type { WeddingOsRequest } from "./http.types";

export function apiResponse<T>(
  request: WeddingOsRequest,
  data: T,
  meta?: { version?: number; nextCursor?: string },
): ApiResponse<T> {
  return {
    data,
    meta: {
      requestId: request.requestId,
      ...(meta?.version === undefined ? {} : { version: meta.version }),
      ...(meta?.nextCursor === undefined
        ? {}
        : { nextCursor: meta.nextCursor }),
    },
  };
}
