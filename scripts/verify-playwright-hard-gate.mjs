import { readFile } from "node:fs/promises";

const reportPath =
  process.env.PLAYWRIGHT_JSON_REPORT ?? "test-results/results.json";
let report;
try {
  report = JSON.parse(await readFile(reportPath, "utf8"));
} catch (error) {
  throw new Error(
    `Playwright JSON report is required at ${reportPath}: ${String(error)}`,
  );
}

const counts = { passed: 0, failed: 0, skipped: 0, retries: 0 };
const visit = (suite) => {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const results = test.results ?? [];
      counts.retries += Math.max(0, results.length - 1);
      const status = results.at(-1)?.status ?? "skipped";
      if (status === "passed") counts.passed += 1;
      else if (status === "skipped") counts.skipped += 1;
      else counts.failed += 1;
    }
  }
  for (const child of suite.suites ?? []) visit(child);
};
for (const suite of report.suites ?? []) visit(suite);
console.log(JSON.stringify(counts));
if (counts.failed || counts.skipped || counts.retries) process.exitCode = 1;
