import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { marketingCapabilityManifest } from "../packages/contracts/dist/marketing-capability-manifest.js";

const apiSource = resolve("apps/api/src");

function filesBelow(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

const controllerSource = filesBelow(apiSource)
  .filter((path) => path.endsWith(".controller.ts"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const failures = [];
for (const [capability, declaration] of Object.entries(
  marketingCapabilityManifest,
)) {
  if (declaration.status === "unavailable") continue;
  for (const operation of declaration.requiredOperations) {
    const match =
      /^(GET|POST|PUT|PATCH|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/(.+)$/.exec(
        operation,
      );
    if (!match) {
      failures.push(
        `${capability}: unsupported manifest operation ${operation}`,
      );
      continue;
    }
    const [, method, relativePath] = match;
    const decorator = `${method[0]}${method.slice(1).toLowerCase()}`;
    const singleRoute = `@${decorator}("${relativePath}")`;
    const canonicalRouteInAliasList = `@${decorator}(["${relativePath}",`;
    if (
      !controllerSource.includes(singleRoute) &&
      !controllerSource.includes(canonicalRouteInAliasList)
    ) {
      failures.push(
        `${capability}: operation not found in controllers: ${operation}`,
      );
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Marketing capability manifest matches controller routes.\n",
  );
}
