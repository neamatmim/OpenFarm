import { describe, expect, it } from "vitest";

import { saidInTaka, saidToThePaisa } from "./taka";

// Money is said one way, in both languages, with the minus where a reader will see it first. These pin
// the two that differ: a sum, which is whole, and a rate, which is not.

describe("a sum of money", () => {
  it("is said in the reader's own numerals", () => {
    expect(saidInTaka(123_456, "bn")).toBe("৳১,২৩,৪৫৬");
    expect(saidInTaka(123_456, "en")).toBe("৳123,456");
  });

  it("puts the minus in front of the taka mark, not after it", () => {
    expect(saidInTaka(-12_345, "bn")).toBe("−৳১২,৩৪৫");
    expect(saidInTaka(-12_345, "en")).toBe("−৳12,345");
  });

  it("is whole, because the farm does not bank the paisa", () => {
    expect(saidInTaka(1234.56, "en")).toBe("৳1,235");
    expect(saidInTaka(-1234.56, "en")).toBe("−৳1,235");
  });

  it("says nothing of a sign at zero", () => {
    expect(saidInTaka(0, "en")).toBe("৳0");
  });
});

describe("a rate", () => {
  it("keeps its paisa, which is the whole point of a rate", () => {
    // A cost per litre rounded to the taka makes two different rates print the same.
    expect(saidToThePaisa(45.5, "en")).toBe("৳45.5");
    expect(saidToThePaisa(45.75, "en")).toBe("৳45.75");
    expect(saidToThePaisa(45.5, "bn")).toBe("৳৪৫.৫");
  });

  it("puts its minus in front too", () => {
    expect(saidToThePaisa(-45.75, "en")).toBe("−৳45.75");
  });

  it("does not carry more paisa than money has", () => {
    expect(saidToThePaisa(45.756, "en")).toBe("৳45.76");
  });
});
