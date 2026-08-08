import { Global, Module } from "@nestjs/common";
import { parseApiEnvironment, type ApiEnvironment } from "@weddingos/config";
import { apiRuntimeEnvironment } from "./runtime-environment";

export const API_ENVIRONMENT = Symbol("API_ENVIRONMENT");

@Global()
@Module({
  providers: [
    {
      provide: API_ENVIRONMENT,
      useFactory: (): ApiEnvironment =>
        parseApiEnvironment(apiRuntimeEnvironment()),
    },
  ],
  exports: [API_ENVIRONMENT],
})
export class EnvironmentModule {}
