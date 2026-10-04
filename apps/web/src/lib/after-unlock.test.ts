import { describe, expect, it } from "vitest";

import { afterUnlock, insideTheApp } from "./after-unlock";

describe("where a Shed Phone goes once unlocked", () => {
  it("goes back to the page it locked on, for the person it locked under", () => {
    const locked = { back: "/work/abc?start=true", for: "rahim" };
    expect(afterUnlock(locked, "rahim")).toBe("/work/abc?start=true");
  });

  it("goes to the day's work for anybody else, or when it knows nothing", () => {
    expect(afterUnlock({ back: "/work/abc", for: "rahim" }, "jasim")).toBe(
      "/work"
    );
    expect(afterUnlock({}, "rahim")).toBe("/work");
  });

  it("takes only a page of the farm's own to go back to", () => {
    expect(insideTheApp("/animals/D-0001")).toBe("/animals/D-0001");
    expect(insideTheApp("https://elsewhere.example")).toBeUndefined();
    expect(insideTheApp("//elsewhere.example")).toBeUndefined();
    expect(insideTheApp("/shed-phone")).toBeUndefined();
    expect(insideTheApp(7)).toBeUndefined();
  });
});
