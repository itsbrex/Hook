import { describe, it, expect, vi } from "vitest";
import { probeHookmark } from "../src/osascript";

describe("probeHookmark", () => {
  it("returns { ok: true } when osascript exits 0", async () => {
    const fakeExec = vi
      .fn()
      .mockResolvedValue({ stdout: "42\n", stderr: "" });
    const result = await probeHookmark({ exec: fakeExec });
    expect(result.ok).toBe(true);
  });

  it("returns { ok: false, reason: 'permission' } on -1743", async () => {
    const fakeExec = vi.fn().mockRejectedValue(
      Object.assign(new Error("stderr"), {
        stderr:
          "execution error: Not authorized to send Apple events (-1743).",
      })
    );
    const result = await probeHookmark({ exec: fakeExec });
    expect(result).toMatchObject({ ok: false, reason: "permission" });
  });

  it("returns { ok: false, reason: 'not_running' } when Hookmark is not running", async () => {
    const fakeExec = vi.fn().mockRejectedValue(
      Object.assign(new Error("stderr"), {
        stderr: "Application isn't running. (-600)",
      })
    );
    const result = await probeHookmark({ exec: fakeExec });
    expect(result).toMatchObject({ ok: false, reason: "not_running" });
  });

  it("returns { ok: false, reason: 'unknown' } on other errors", async () => {
    const fakeExec = vi.fn().mockRejectedValue(
      Object.assign(new Error("boom"), { stderr: "weird failure" })
    );
    const result = await probeHookmark({ exec: fakeExec });
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toBe("unknown");
  });
});
