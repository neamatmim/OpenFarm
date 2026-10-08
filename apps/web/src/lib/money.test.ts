import { describe, expect, it } from "vitest";

import { saidAsMoney, saidAsMoneyRate } from "./money";

// Money is said one way, in both languages, with the minus where a reader will see it first. These pin
// the two that differ: a sum, which is whole, and a rate, which is not.

describe("a sum of money", () => {
  it("is said in the reader's own numerals", () => {
    expect(saidAsMoney(123_456, "bn")).toBe("৳১,২৩,৪৫৬");
    expect(saidAsMoney(123_456, "en")).toBe("৳123,456");
  });

  it("puts the minus in front of the taka mark, not after it", () => {
    expect(saidAsMoney(-12_345, "bn")).toBe("−৳১২,৩৪৫");
    expect(saidAsMoney(-12_345, "en")).toBe("−৳12,345");
  });

  it("is whole, because the farm does not bank the paisa", () => {
    expect(saidAsMoney(1234.56, "en")).toBe("৳1,235");
    expect(saidAsMoney(-1234.56, "en")).toBe("−৳1,235");
  });

  it("says nothing of a sign at zero", () => {
    expect(saidAsMoney(0, "en")).toBe("৳0");
  });
});

describe("a figure that rounds to nothing", () => {
  it("is never a minus nought: the sign is the rounded figure's, not the paisa it lost", () => {
    // A Venture Account closed to the paisa can sit a fraction of a taka below nought once its lines are added.
    expect(saidAsMoney(-0.3, "bn")).toBe("৳০");
    expect(saidAsMoney(-0.3, "en")).toBe("৳0");
    expect(saidAsMoneyRate(-0.001, "en")).toBe("৳0");
  });

  it("keeps the minus on anything that is still below nought when rounded", () => {
    expect(saidAsMoney(-0.6, "en")).toBe("−৳1");
    expect(saidAsMoneyRate(-0.01, "en")).toBe("−৳0.01");
  });
});

describe("a rate", () => {
  it("keeps its paisa, which is the whole point of a rate", () => {
    // A cost per liter rounded to the taka makes two different rates print the same.
    expect(saidAsMoneyRate(45.5, "en")).toBe("৳45.5");
    expect(saidAsMoneyRate(45.75, "en")).toBe("৳45.75");
    expect(saidAsMoneyRate(45.5, "bn")).toBe("৳৪৫.৫");
  });

  it("puts its minus in front too", () => {
    expect(saidAsMoneyRate(-45.75, "en")).toBe("−৳45.75");
  });

  it("does not carry more paisa than money has", () => {
    expect(saidAsMoneyRate(45.756, "en")).toBe("৳45.76");
  });
});
