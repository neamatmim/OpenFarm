import { describe, expect, it } from "vitest";

import { answerTheAsking, askForPassword, isAsking } from "./password-again";

describe("asking for the password again", () => {
  it("is shared by acts refused together, and answers them all at once", async () => {
    const first = askForPassword();
    const second = askForPassword();
    expect(isAsking()).toBe(true);

    answerTheAsking(true);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(isAsking()).toBe(false);
  });

  it("leaves the acts refused when the password is not given", async () => {
    const asked = askForPassword();
    answerTheAsking(false);
    await expect(asked).resolves.toBe(false);
  });
});
