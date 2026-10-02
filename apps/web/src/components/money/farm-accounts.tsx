import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useIsOwner } from "@/components/money";
import { Section } from "@/components/page";
import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

type Kind = "bkash" | "bank";

interface Typed {
  kind: Kind;
  name: string;
  number: string;
  bank: string;
  branch: string;
}

const NOTHING_TYPED: Typed = {
  kind: "bkash",
  name: "",
  number: "",
  bank: "",
  branch: "",
};

/** The Owner listing one more of the Farm's own bKash numbers or bank accounts. */
const AddAccount = () => {
  const { t } = useLanguage();
  const refused = useRefused();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState<Typed>(NOTHING_TYPED);
  const edit = (patch: Partial<Typed>) => setTyped({ ...typed, ...patch });
  const add = useMutation(
    orpc.farmAccounts.add.mutationOptions({
      onSuccess: async () => {
        setTyped(NOTHING_TYPED);
        toast.success(t("farmAccounts.added"));
        await queryClient.invalidateQueries({
          queryKey: orpc.farmAccounts.key(),
        });
      },
      onError: refused,
    })
  );
  const isBank = typed.kind === "bank";
  const ready = typed.name.trim() !== "" && typed.number.trim().length >= 3;
  return (
    <form
      className="grid gap-3 border-t pt-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate({
          kind: typed.kind,
          name: typed.name.trim(),
          number: typed.number.trim(),
          ...(isBank && typed.bank.trim() ? { bank: typed.bank.trim() } : {}),
          ...(isBank && typed.branch.trim()
            ? { branch: typed.branch.trim() }
            : {}),
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="farm-account-kind">{t("farmAccounts.kind")}</Label>
        <select
          className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
          id="farm-account-kind"
          onChange={(event) =>
            edit({ kind: event.target.value === "bank" ? "bank" : "bkash" })
          }
          value={typed.kind}
        >
          <option value="bkash">{t("money.method.bkash")}</option>
          <option value="bank">{t("money.method.bank")}</option>
        </select>
      </div>
      <FormField id="farm-account-name" label={t("farmAccounts.name")}>
        <Input
          id="farm-account-name"
          maxLength={80}
          onChange={(event) => edit({ name: event.target.value })}
          value={typed.name}
        />
      </FormField>
      <FormField id="farm-account-number" label={t("farmAccounts.number")}>
        <Input
          id="farm-account-number"
          inputMode="numeric"
          maxLength={40}
          onChange={(event) => edit({ number: event.target.value })}
          value={typed.number}
        />
      </FormField>
      {isBank ? (
        <>
          <FormField id="farm-account-bank" label={t("farmAccounts.bank")}>
            <Input
              id="farm-account-bank"
              maxLength={80}
              onChange={(event) => edit({ bank: event.target.value })}
              value={typed.bank}
            />
          </FormField>
          <FormField id="farm-account-branch" label={t("farmAccounts.branch")}>
            <Input
              id="farm-account-branch"
              maxLength={80}
              onChange={(event) => edit({ branch: event.target.value })}
              value={typed.branch}
            />
          </FormField>
        </>
      ) : null}
      <div className="sm:col-span-2">
        <Button disabled={!ready || add.isPending} type="submit">
          {t("farmAccounts.add")}
        </Button>
      </div>
    </form>
  );
};

/**
 * The Farm's own bKash numbers and bank accounts. Once one of a kind is listed, bKash or bank money names which it
 * went into or came out of, with its transaction ID. The Owner's to list and retire; the Manager reads them, the
 * numbers masked. A retired one stays on the books it was named on and is offered for no new money.
 */
export const FarmAccounts = ({ id }: { id: string }) => {
  const { t } = useLanguage();
  const isOwner = useIsOwner();
  const refused = useRefused();
  const queryClient = useQueryClient();
  const listed = useQuery(orpc.farmAccounts.list.queryOptions());
  const retire = useMutation(
    orpc.farmAccounts.retire.mutationOptions({
      onSuccess: async () => {
        toast.success(t("farmAccounts.retiredDone"));
        await queryClient.invalidateQueries({
          queryKey: orpc.farmAccounts.key(),
        });
      },
      onError: refused,
    })
  );
  const accounts = listed.data ?? [];
  return (
    <Section
      className="scroll-mt-6"
      description={t("farmAccounts.why")}
      id={id}
      title={t("farmAccounts.title")}
    >
      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("farmAccounts.none")}
        </p>
      ) : (
        <ul className="divide-y">
          {accounts.map((one) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-2"
              key={one.id}
            >
              <div className={one.retired ? "text-muted-foreground" : ""}>
                <p className="text-sm font-medium">
                  {one.name}
                  {one.retired ? ` · ${t("farmAccounts.retired")}` : ""}
                </p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {t(
                    one.kind === "bkash"
                      ? "money.method.bkash"
                      : "money.method.bank"
                  )}{" "}
                  · {one.number}
                  {one.bank ? ` · ${one.bank}` : ""}
                  {one.branch ? `, ${one.branch}` : ""}
                </p>
              </div>
              {isOwner && !one.retired ? (
                <Button
                  disabled={retire.isPending}
                  onClick={() => retire.mutate({ id: one.id })}
                  size="sm"
                  variant="outline"
                >
                  {t("farmAccounts.retire")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {isOwner ? <AddAccount /> : null}
    </Section>
  );
};
