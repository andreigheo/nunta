import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { WeddingOsRequest } from "../common/http.types";

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<WeddingOsRequest>();
    return request.auth;
  },
);
