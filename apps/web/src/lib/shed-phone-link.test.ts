import { describe, expect, it } from "vitest";

import { codeAsTyped, codeInTheLink, shedPhoneLink } from "./shed-phone-link";

describe("the shed phone's set-up link", () => {
  it("carries the code after a #, which no server, log or Referer ever sees", () => {
    const link = shedPhoneLink("https://farm.example", "AB12CD34EF");
    expect(link).toBe("https://farm.example/shed-phone#code=AB12CD34EF");
    expect(new URL(link).search).toBe("");
  });

  it("is read back on the phone as the code the Manager was given", () => {
    expect(codeInTheLink("#code=AB12CD34EF")).toBe("AB12CD34EF");
  });

  it("reads nothing from a page opened any other way", () => {
    expect(codeInTheLink("")).toBeNull();
    expect(codeInTheLink("#main")).toBeNull();
    expect(codeInTheLink("#code=")).toBeNull();
  });

  it("reads nothing, and never throws, from a link whose code was cut or garbled", () => {
    expect(codeInTheLink("#code=%E0%A4")).toBeNull();
    expect(codeInTheLink("#code=%")).toBeNull();
  });

  it("cleans a code as the box does: spaces and dashes dropped, Bangla digits read, in capitals", () => {
    expect(codeAsTyped("ab12-cd ৩৪ef")).toBe("AB12CD34EF");
    expect(codeInTheLink("#code=ab12-cd34ef")).toBe("AB12CD34EF");
  });
});
