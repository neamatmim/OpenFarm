import { describe, expect, it } from "vitest";

import {
  countOfflineGuess,
  forgetOfflineGuesses,
  offlineLockedOut,
} from "./offline-pin-guesses";

// With no signal the Shed Phone checks a PIN against its own list, and the farm's count of wrong ones never sees them:
// so the phone counts them itself, five for one person in fifteen minutes, as the farm does.

const memory = () => {
  const kept = new Map<string, string>();
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => {
      kept.set(key, value);
    },
    removeItem: (key: string) => {
      kept.delete(key);
    },
  };
};

const MINUTE = 60_000;

describe("PINs guessed with no signal", () => {
  it("stop being taken for a person after five wrong ones, for fifteen minutes", () => {
    const storage = memory();
    const at = 1_000_000;
    for (let guess = 0; guess < 5; guess += 1) {
      expect(offlineLockedOut("rahim", at, storage)).toBe(false);
      countOfflineGuess("rahim", at, storage);
    }
    expect(offlineLockedOut("rahim", at, storage)).toBe(true);
    // Somebody else is not locked out by it.
    expect(offlineLockedOut("karim", at, storage)).toBe(false);
    // And fifteen minutes on, the wrong ones are forgotten.
    expect(offlineLockedOut("rahim", at + 15 * MINUTE + 1, storage)).toBe(
      false
    );
  });

  it("are forgotten for a person who gets theirs right", () => {
    const storage = memory();
    countOfflineGuess("rahim", 1, storage);
    countOfflineGuess("rahim", 2, storage);
    forgetOfflineGuesses("rahim", storage);
    for (let guess = 0; guess < 4; guess += 1) {
      countOfflineGuess("rahim", 3, storage);
    }
    expect(offlineLockedOut("rahim", 3, storage)).toBe(false);
  });
});
