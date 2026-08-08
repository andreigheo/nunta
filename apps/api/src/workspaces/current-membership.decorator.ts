import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { WeddingOsRequest } from "../common/http.types";

export const CurrentMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<WeddingOsRequest>();
    return request.membership;
  },
);
