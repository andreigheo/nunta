import { Global, Module } from "@nestjs/common";
import { AsyncService } from "./async.service";

@Global()
@Module({
  providers: [AsyncService],
  exports: [AsyncService],
})
export class AsyncModule {}
