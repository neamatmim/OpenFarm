import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_COMMON,
} from "@OpenFarm/auth/password";
import { WRONG_ADDRESS } from "@OpenFarm/auth/wrong-address";
import type { MessageKey, MessageParams } from "@OpenFarm/i18n";
import { buttonVariants } from "@OpenFarm/ui/components/button";

import { Notice } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/** Why a sign-in was refused, and — for somebody who signed in at the other of the farm's addresses — their own. */
export interface SignInRefusal {
  message: string;
  home: string | null;
}

/**
 * The sign-in library's own refusals, which it says in English, in the farm's words. The farm's own refusals — not
 * invited, slowed after guesses, a password too common — arrive already in the reader's language and are kept as said.
 */
const LIBRARY_WORDS: Readonly<Record<string, MessageKey>> = {
  INVALID_EMAIL_OR_PASSWORD: "auth.wrongEmailOrPassword",
  INVALID_PASSWORD: "auth.wrongPassword",
  INVALID_EMAIL: "auth.invalidEmail",
  PASSWORD_TOO_SHORT: "auth.passwordTooShort",
  PASSWORD_TOO_LONG: "auth.passwordTooLong",
  USER_ALREADY_EXISTS: "auth.alreadyHasAccount",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "auth.alreadyHasAccount",
  SESSION_EXPIRED: "auth.signInAgainFirst",
  SESSION_NOT_FRESH: "auth.signInAgainFirst",
};

/** The codes of the farm's own sign-in refusals, which arrive in the reader's language already. */
const FARM_CODES = new Set<string>([
  WRONG_ADDRESS,
  PASSWORD_TOO_COMMON,
  "ACCOUNT_SLOWED",
]);

/** The library's codes are capitals with underscores; a refusal of the farm's own carries a code of its own or none. */
const LIBRARY_CODE = /^[A-Z_]+$/u;

/** Why a sign-in, a sign-up or a password change was refused, in the reader's language: the library's refusal by its
 *  code, the farm's own as it said it, and anything else as `otherwise` — never the library's English. */
export const sayAuthRefusal = (
  error: { message?: string; code?: string },
  t: (key: MessageKey, params?: MessageParams) => string,
  otherwise: string
): string => {
  const word = error.code ? LIBRARY_WORDS[error.code] : undefined;
  if (word) {
    return t(word, { min: PASSWORD_MIN_LENGTH });
  }
  const theLibrarys =
    error.code !== undefined &&
    LIBRARY_CODE.test(error.code) &&
    !FARM_CODES.has(error.code);
  return theLibrarys ? otherwise : error.message || otherwise;
};

/** A refused sign-in as the page keeps it, from what the sign-in answered. */
export const refusalOf = (
  error: { message?: string; statusText?: string; code?: string } & Record<
    string,
    unknown
  >,
  t: (key: MessageKey, params?: MessageParams) => string,
  otherwise: string = t("common.error")
): SignInRefusal => ({
  message: sayAuthRefusal(error, t, otherwise),
  home:
    error.code === WRONG_ADDRESS && typeof error.address === "string"
      ? error.address
      : null,
});

/** Why the sign-in was refused, kept on the card, with a link to their own address where that was why. */
export const RefusedNotice = ({ refusal }: { refusal: SignInRefusal }) => {
  const { t } = useLanguage();
  return (
    <Notice
      action={
        refusal.home ? (
          <a
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={refusal.home}
          >
            {t("auth.goToYourAddress")}
          </a>
        ) : null
      }
      title={t("auth.refused")}
      tone="danger"
    >
      {refusal.message}
    </Notice>
  );
};
