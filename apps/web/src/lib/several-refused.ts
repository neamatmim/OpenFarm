import type { RefusedOne } from "@OpenFarm/api/one-of-several";
import type { MessageKey, MessageParams } from "@OpenFarm/i18n";

import { sayWhy } from "./saying";

/**
 * Each animal of several the farm would not do it for, by her tag and why, in the reader's words: one still under her
 * meat withdrawal said with the day she is fit, any other refusal by its own word — never the server's English.
 */
export const refusedLines = (
  refused: readonly RefusedOne[],
  t: (key: MessageKey, params?: MessageParams) => string,
  daySaid: (iso: string) => string
): string[] =>
  refused.map((one) => {
    const why =
      one.refusal === "meat_withdrawal" && one.fitOn
        ? t("ready.underWithdrawal", { when: daySaid(one.fitOn) })
        : sayWhy({ data: { refusal: one.refusal } }, t);
    return `${one.tagNumber}: ${why}`;
  });
