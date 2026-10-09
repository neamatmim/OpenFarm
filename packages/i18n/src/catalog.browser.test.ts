import { beforeEach, describe, expect, it, vi } from "vitest";

const downloads = vi.hoisted(() => ({ core: vi.fn(), desk: vi.fn() }));

vi.mock("./messages/en-core", () => ({
  get enCore() {
    return downloads.core();
  },
}));
vi.mock("./messages/en-desk", () => ({
  get enDesk() {
    return downloads.desk();
  },
}));

beforeEach(() => {
  vi.resetModules();
  downloads.core.mockReset().mockReturnValue({ "common.retry": "Try again" });
  downloads.desk.mockReset().mockReturnValue({ "desk.title": "Desk" });
});

describe("language downloads", () => {
  it.each(["core", "desk"] as const)(
    "retries a failed %s download and shares concurrent requests",
    async (part) => {
      const failure = new Error("connection lost");
      downloads[part].mockImplementationOnce(() => {
        throw failure;
      });
      const { loadMessages, CATALOGS } = await import("./catalog.browser");
      const first = loadMessages("en", part);
      const alsoFirst = loadMessages("en", part);
      expect(alsoFirst).toBe(first);
      await expect(first).rejects.toThrow("connection lost");
      expect(CATALOGS.en).toBeUndefined();

      const retry = loadMessages("en", part);
      expect(retry).not.toBe(first);
      await retry;
      await loadMessages("en", part);
      expect(downloads[part]).toHaveBeenCalledTimes(2);
      expect(CATALOGS.en).toEqual(
        part === "core"
          ? { "common.retry": "Try again" }
          : { "desk.title": "Desk" }
      );
    }
  );

  it("keeps the readable core when the desk download fails, then fills in the missing words", async () => {
    downloads.desk.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    const { loadMessages, loadDeskWords, CATALOGS } =
      await import("./catalog.browser");
    await loadMessages("en");
    await loadDeskWords();
    expect(CATALOGS.en).toEqual({ "common.retry": "Try again" });
    await loadDeskWords();
    expect(CATALOGS.en).toEqual({
      "common.retry": "Try again",
      "desk.title": "Desk",
    });
  });
});
