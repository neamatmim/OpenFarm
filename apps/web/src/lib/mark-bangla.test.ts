// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { markBanglaWhileEnglish, mostlyBangla } from "./mark-bangla";

/** The frame after a change, once the marker has looked at it: the page's changes are told to it first. */
const aFrameLater = async () => {
  await Promise.resolve();
  vi.advanceTimersToNextFrame();
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("Bangla words on an English page", () => {
  it("are said to be Bangla, and English and what the page marked itself are left alone", () => {
    document.documentElement.lang = "en";
    document.body.innerHTML = `
      <table><tr><td id="feed">গমের ভুসি</td><td id="english">Wheat bran</td></tr></table>
      <span lang="en"><b id="said">গম</b></span>`;

    const takeBack = markBanglaWhileEnglish();

    expect(document.querySelector("#feed")?.getAttribute("lang")).toBe("bn");
    expect(document.querySelector("#english")?.hasAttribute("lang")).toBe(
      false
    );
    expect(document.querySelector("#said")?.hasAttribute("lang")).toBe(false);
    takeBack();
    expect(document.querySelector("#feed")?.hasAttribute("lang")).toBe(false);
  });

  it("follows the page as it changes: a new Bangla name is marked, one that turned English is not", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    document.documentElement.lang = "en";
    document.body.innerHTML = `<p id="name">গাভী</p>`;
    const takeBack = markBanglaWhileEnglish();

    const added = document.createElement("li");
    added.textContent = "খড়";
    document.body.append(added);
    const name = document.querySelector("#name");
    if (name?.firstChild) {
      name.firstChild.textContent = "Cow";
    }
    await aFrameLater();

    expect(added.getAttribute("lang")).toBe("bn");
    expect(name?.hasAttribute("lang")).toBe(false);
    takeBack();
  });

  it("counts letters, so a Bangla name with a figure or an English word beside it is still Bangla", () => {
    expect(mostlyBangla("গমের ভুসি 25 kg")).toBe(true);
    expect(mostlyBangla("Feed: গম")).toBe(false);
    expect(mostlyBangla("৳১,২০০")).toBe(false);
  });
});
