import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

/** The Venture Account's details as the sheet holds them while they are typed. */
interface Written {
  bank: string;
  branch: string;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
}

/** Each detail, its box's name and its box's id, in the order a bank's own paper puts them. */
const FIELDS = [
  { key: "bank", label: "ventures.account.bank" },
  { key: "branch", label: "ventures.account.branch" },
  { key: "accountName", label: "ventures.account.name" },
  { key: "accountNumber", label: "ventures.account.number" },
  { key: "routingNumber", label: "ventures.account.routing" },
] as const;

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
  const [written, setWritten] = useState<Written>({
    bank: now?.bank ?? "",
    branch: now?.branch ?? "",
    accountName: now?.accountName ?? "",
    accountNumber: now?.accountNumber ?? "",
    routingNumber: now?.routingNumber ?? "",
  });
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
  const label = now
    ? t("ventures.account.change")
    : t("ventures.account.write");
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
      {FIELDS.map((field) => (
        <FormField
          id={`venture-account-${field.key}`}
          key={field.key}
          label={t(field.label)}
        >
          <Input
            autoComplete="off"
            id={`venture-account-${field.key}`}
            onChange={(event) =>
              setWritten({ ...written, [field.key]: event.target.value })
            }
            value={written[field.key]}
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
          {account ? t("ventures.account.change") : t("ventures.account.write")}
        </Button>
      }
      description={t("ventures.account.hint")}
      title={t("ventures.account.title")}
    >
      {account ? (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {FIELDS.map((field) =>
            account[field.key] ? (
              <div className="flex flex-col" key={field.key}>
                <dt className="text-muted-foreground">{t(field.label)}</dt>
                <dd className="font-medium break-words">
                  {account[field.key]}
                </dd>
              </div>
            ) : null
          )}
        </dl>
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
