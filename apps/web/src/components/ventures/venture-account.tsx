import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import type { VentureAccount } from "@/components/ventures/venture-account-details";
import {
  ACCOUNT_DETAILS,
  ACCOUNT_DETAIL_KEYS,
  VentureAccountDetails,
} from "@/components/ventures/venture-account-details";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

/** The Venture Account's details as the sheet holds them while they are typed. */
type Written = Record<keyof VentureAccount, string>;

/** What the act is called: writing the account for the first time, or changing what is written. */
const writeOrChange = (account: VentureAccount | null) =>
  account ? "ventures.account.change" : "ventures.account.write";

/**
 * Writing or changing the Venture Account: the bank, the account's name and its number, and the branch and routing
 * number if the Owner has them — with the warning beside it that every change is kept, because this is where the
 * Investors' money is told to go.
 */
const AccountSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: Venture;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  // An answer this phone kept from before the account could be written has none.
  const now = venture.account ?? null;
  const [written, setWritten] = useState<Written>(
    () =>
      Object.fromEntries(
        ACCOUNT_DETAIL_KEYS.map((key) => [key, now?.[key] ?? ""])
      ) as Written
  );
  const saving = useMutation(
    orpc.ventures.setBankAccount.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("ventures.account.saved"));
      },
    })
  );
  const ready =
    written.bank.trim() !== "" &&
    written.accountName.trim() !== "" &&
    written.accountNumber.trim() !== "";
  const label = t(writeOrChange(now));
  return (
    <FormSheet
      description={t("ventures.account.sheetHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => saving.mutate({ id: venture.id, ...written })}
      open={open}
      pending={saving.isPending}
      ready={ready}
      submitLabel={label}
      title={label}
    >
      {ACCOUNT_DETAIL_KEYS.map((key) => (
        <FormField
          id={`venture-account-${key}`}
          key={key}
          label={t(ACCOUNT_DETAILS[key])}
        >
          <Input
            autoComplete="off"
            id={`venture-account-${key}`}
            onChange={(event) =>
              setWritten({ ...written, [key]: event.target.value })
            }
            value={written[key]}
          />
        </FormField>
      ))}
    </FormSheet>
  );
};

/**
 * The Venture Account's bank details on the Owner's page: what is written, or that nothing is yet, and the act that
 * writes or changes them (ADR 0008). A signed Investor is shown them on their own Agreement; nobody else is.
 */
export const VentureAccountPanel = ({ venture }: { venture: Venture }) => {
  const { t } = useLanguage();
  const [writing, setWriting] = useState(false);
  const account = venture.account ?? null;
  return (
    <Section
      action={
        <Button onClick={() => setWriting(true)} size="sm" variant="outline">
          <Landmark aria-hidden data-icon="inline-start" />
          {t(writeOrChange(account))}
        </Button>
      }
      description={t("ventures.account.hint")}
      title={t("ventures.account.title")}
    >
      {account ? (
        <VentureAccountDetails account={account} />
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("ventures.account.none")}
        </p>
      )}
      {/* Drawn afresh each time it opens, so it starts from what is written now. */}
      {writing ? (
        <AccountSheet onOpenChange={setWriting} open venture={venture} />
      ) : null}
    </Section>
  );
};
