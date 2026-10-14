import { describe, expect, it } from "vitest";

import { vetOnPaper } from "./papers";

describe("the Vet as a paper names them", () => {
  it("prints their BVC number beside their name, in the paper's language", () => {
    expect(vetOnPaper("ডা. করিম", "BVC-0457")).toEqual({
      bn: "ডা. করিম (বিভিসি নং BVC-0457)",
      en: "ডা. করিম (BVC no. BVC-0457)",
    });
  });

  it("is their name alone where the farm has no number for them", () => {
    expect(vetOnPaper("ডা. করিম", null)).toEqual({
      bn: "ডা. করিম",
      en: "ডা. করিম",
    });
  });
});
