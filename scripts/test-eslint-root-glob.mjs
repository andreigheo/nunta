import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const plugin = require.resolve("@next/eslint-plugin-next");
const pluginRequire = createRequire(plugin);
const rootsModule = join(dirname(plugin), "utils/get-root-dirs.js");
const { getRootDirs } = require(rootsModule);

test("Next root discovery preserves directory, range and path semantics", () => {
  const original = process.cwd();
  const fixture = mkdtempSync(
    join(
      process.env.SECURITY_TEST_TMP_DIR ?? tmpdir(),
      "sarbato-eslint-roots-",
    ),
  );
  const directories = [
    "apps/web/child",
    "apps/admin",
    "apps/.hidden",
    "dir1",
    "dir2",
    "dir3",
    "dir5",
    "dir10",
    "dir11",
    "dir12",
    "dir01",
    "dir02",
    "dir03",
  ];
  for (const dir of directories)
    mkdirSync(join(fixture, dir), { recursive: true });
  writeFileSync(join(fixture, "apps/file.txt"), "not a directory");
  symlinkSync("web", join(fixture, "apps/linked"), "dir");
  const discover = (rootDir) =>
    getRootDirs({ cwd: fixture, settings: { next: { rootDir } } }).sort();
  try {
    process.chdir(fixture);
    assert.deepEqual(discover(undefined), [fixture]);
    assert.deepEqual(discover("apps/web"), ["apps/web"]);
    assert.deepEqual(discover("./apps/web"), ["./apps/web"]);
    assert.deepEqual(discover("apps\\web"), ["apps/web"]);
    assert.deepEqual(discover("apps/*"), [
      "apps/admin",
      "apps/linked",
      "apps/web",
    ]);
    assert.deepEqual(discover("apps/{admin,web}"), ["apps/admin", "apps/web"]);
    assert.deepEqual(discover("dir{10..12}"), ["dir10", "dir11", "dir12"]);
    assert.deepEqual(discover("dir{01..03}"), ["dir01", "dir02", "dir03"]);
    assert.deepEqual(discover("dir{1..5..2}"), ["dir1", "dir3", "dir5"]);
    assert.deepEqual(discover(["apps/web", "apps/admin", 1]), [
      "apps/admin",
      "apps/web",
    ]);
    assert.deepEqual(discover(join(fixture, "apps/web")), [
      join(fixture, "apps/web"),
    ]);
    assert.deepEqual(discover("missing/*"), []);
    assert.deepEqual(discover("apps/file.txt"), []);
    assert.equal(pluginRequire("fast-glob/package.json").name, "fast-glob");
    assert.doesNotMatch(
      readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8"),
      /^  braces@/m,
    );
  } finally {
    process.chdir(original);
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("deep brace and parenthesis patterns cannot exhaust the root discovery stack", () => {
  for (const [open, close] of [
    ["{", "}"],
    ["(", ")"],
    ["{(", ")}"],
  ]) {
    const script = `const {getRootDirs}=require(process.argv[1]);try {getRootDirs({cwd:process.cwd(),settings:{next:{rootDir:process.argv[2]}}});throw Error('Expected rejection');} catch(e) {if(!['ERR_BRACES_DEPTH','ENAMETOOLONG'].includes(e.code) && !/exceeds max characters/.test(e.message)) throw e;}`;
    const result = spawnSync(
      process.execPath,
      [
        "--stack_size=256",
        "--max-old-space-size=128",
        "-e",
        script,
        rootsModule,
        open.repeat(3000) + "x" + close.repeat(3000),
      ],
      { timeout: 5000, encoding: "utf8" },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.signal, null);
  }
});

test("all string and AST entry points reject excessive depth without an options bypass", () => {
  const braces = require("../packages/security-braces");
  const micromatch = createRequire(pluginRequire.resolve("fast-glob"))(
    "micromatch",
  );
  for (const pattern of [
    "{".repeat(500) + "x" + "}".repeat(500),
    "(".repeat(500) + "x" + ")".repeat(500),
    "{1.." + "(".repeat(500) + "x" + ")".repeat(500) + ",y}",
  ]) {
    for (const method of [
      braces,
      braces.parse,
      braces.compile,
      braces.expand,
      braces.stringify,
    ]) {
      assert.throws(
        () => method(pattern, { maxDepth: Infinity, maxLength: Infinity }),
        { code: "ERR_BRACES_DEPTH" },
      );
    }
    for (const method of [
      micromatch.parse,
      micromatch.braces,
      micromatch.braceExpand,
    ])
      assert.throws(() => method("{" + pattern + "}"), {
        code: "ERR_BRACES_DEPTH",
      });
  }
  let ast = { type: "text", value: "x" };
  for (let i = 0; i < 500; i++) ast = { type: "paren", nodes: [ast] };
  for (const method of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => method(ast), { code: "ERR_BRACES_DEPTH" });
    const cyclic = { type: "root", nodes: [] };
    cyclic.nodes.push(cyclic);
    assert.throws(() => method(cyclic), { code: "ERR_BRACES_DEPTH" });
  }
  const nearLimit = "(".repeat(127) + "x" + ")".repeat(127);
  assert.equal(braces.stringify(nearLimit), nearLimit);
  assert.throws(() => braces.parse("(".repeat(128) + "x" + ")".repeat(128)), {
    code: "ERR_BRACES_DEPTH",
  });
});

test("ordinary brace behavior remains compatible with upstream", () => {
  const braces = require("../packages/security-braces");
  const cases = [
    ["{a,b}", ["a", "b"]],
    ["{a,{b,c}}", ["a", "b", "c"]],
    ["{10..12}", ["10", "11", "12"]],
    ["{01..03}", ["01", "02", "03"]],
    ["{5..1..2}", ["5", "3", "1"]],
    ["{a..c}", ["a", "b", "c"]],
    ["{,a}", ["", "a"]],
    ["\\{a,b\\}", ["{a,b}"]],
    ['"{a,b}"', ["{a,b}"]],
    ["${a,b}", ["${a,b}"]],
  ];
  for (const [input, expected] of cases)
    assert.deepEqual(braces.expand(input), expected);
  assert.equal(braces.compile("a/{b,c}/d"), "a/(b|c)/d");
  assert.deepEqual(braces("{a,a,b}", { expand: true, nodupes: true }), [
    "a",
    "b",
  ]);
});
