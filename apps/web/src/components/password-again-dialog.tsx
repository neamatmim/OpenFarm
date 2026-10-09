import { useId, useState, useSyncExternalStore } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { FormDialog, FormField } from "@/components/page-kit";
import { useT } from "@/i18n/language-provider";
import { answerTheAsking, isAsking, onAsking } from "@/lib/password-again";
import { useRefused } from "@/lib/refused";
import { sayWhy, wordOf } from "@/lib/saying";
import { client } from "@/utils/orpc";

const PASSWORD_WORDS = {
  password_wrong: "passwordAgain.wrong",
  account_slowed: "passwordAgain.slowed",
} as const;

/**
 * Asks for the password again when an act that pays money out, approves money, opens the portal or copies an
 * Investor's data was refused for want of it; given, the act is sent again as it was. Drawn once, in the shell.
 *
 * The kit's form dialog: a wrong password is said under the box it is about, and anything else the farm says — too
 * many tries — at the dialog's top.
 */
export const PasswordAgainDialog = () => {
  const t = useT();
  const refused = useRefused(PASSWORD_WORDS);
  const asking = useSyncExternalStore(onAsking, isAsking, () => false);
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const field = useId();

  const close = (given: boolean) => {
    setPassword("");
    setWrong(null);
    answerTheAsking(given);
  };

  const give = async () => {
    setSending(true);
    setWrong(null);
    try {
      await client.people.givePassword({ password });
    } catch (error) {
      setSending(false);
      if (wordOf(error) === "password_wrong") {
        setWrong(sayWhy(error, t, PASSWORD_WORDS));
      } else {
        refused(error);
      }
      return;
    }
    setSending(false);
    close(true);
  };

  return (
    <FormDialog
      keepsWhatIsTyped={false}
      description={t("passwordAgain.why")}
      onOpenChange={(opening) => {
        if (!opening) {
          close(false);
        }
      }}
      onSubmit={give}
      open={asking}
      pending={sending}
      ready={password !== ""}
      submitLabel={t("passwordAgain.give")}
      title={t("passwordAgain.title")}
    >
      <FormField error={wrong} id={field} label={t("passwordAgain.label")}>
        <PasswordInput
          autoComplete="current-password"
          autoFocus
          id={field}
          onChange={(event) => setPassword(event.target.value)}
          required
          value={password}
        />
      </FormField>
    </FormDialog>
  );
};
