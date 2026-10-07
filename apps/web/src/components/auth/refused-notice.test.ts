import type { MessageKey, MessageParams } from "@OpenFarm/i18n";
import { translate } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { sayAuthRefusal } from "./refused-notice";

const t = (key: MessageKey, params?: MessageParams) =>
  translate("bn", key, params);

describe("a refused sign-in, in the reader's language", () => {
  it("says the sign-in library's refusals in the farm's words, never its English", () => {
    const wrong = {
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    };
    expect(sayAuthRefusal(wrong, t, "x")).toBe(t("auth.wrongEmailOrPassword"));
    // One the farm has no word for reads as the page's own, not "Failed to create session".
    expect(
      sayAuthRefusal(
        {
          code: "FAILED_TO_CREATE_SESSION",
          message: "Failed to create session",
        },
        t,
        t("auth.refused")
      )
    ).toBe(t("auth.refused"));
  });

  it("keeps the farm's own refusals as they were said", () => {
    expect(
      sayAuthRefusal(
        { code: "ACCOUNT_SLOWED", message: "একটু পরে চেষ্টা করুন" },
        t,
        "x"
      )
    ).toBe("একটু পরে চেষ্টা করুন");
  });
});
