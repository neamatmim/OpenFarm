import { WRONG_ADDRESS } from "@OpenFarm/auth/wrong-address";
import { buttonVariants } from "@OpenFarm/ui/components/button";

import { Notice } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/** Why a sign-in was refused, and — for somebody who signed in at the other of the farm's addresses — their own. */
export interface SignInRefusal {
  message: string;
  home: string | null;
}

/** A refused sign-in as the page keeps it, from what the sign-in answered. */
export const refusalOf = (
  error: { message?: string; statusText?: string; code?: string } & Record<
    string,
    unknown
  >,
  otherwise: string
): SignInRefusal => ({
  message: error.message || error.statusText || otherwise,
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
