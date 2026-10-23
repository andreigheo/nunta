import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("can retry Paddle loading after a failed script without initiating checkout", async () => {
  vi.resetModules();
  const scripts: FakeScript[] = [];
  class FakeScript extends EventTarget {
    dataset: Record<string, string> = {};
    src = "";
    async = false;
    remove() { scripts.splice(scripts.indexOf(this), 1); }
  }
  const paddle = {
    Initialize: vi.fn(),
    Environment: { set: vi.fn() },
    Checkout: { open: vi.fn() },
  };
  const browser: { Paddle?: typeof paddle } = {};
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", {
    querySelector: () => scripts[0] ?? null,
    createElement: () => new FakeScript(),
    head: { appendChild: (script: FakeScript) => scripts.push(script) },
  });
  const { loadPaddle } = await import("./paddle");
  const failed = expect(loadPaddle("test_client_token", "sandbox")).rejects.toThrow("Paddle.js nu a putut fi încărcat");
  scripts[0].dispatchEvent(new Event("error"));
  await failed;
  expect(scripts).toHaveLength(0);
  const retry = loadPaddle("test_client_token", "sandbox");
  expect(scripts).toHaveLength(1);
  browser.Paddle = paddle;
  scripts[0].dispatchEvent(new Event("load"));
  await expect(retry).resolves.toBe(paddle);
  expect(paddle.Initialize).toHaveBeenCalledOnce();
  expect(paddle.Checkout.open).not.toHaveBeenCalled();
});
