import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import { useLanguage } from "@/i18n/language-provider";
import type { Photo } from "@/lib/photo";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

interface Terms {
  investorId: string;
  units: string;
  investorsPercent: string;
  arbitrator: string;
  stampValueBdt: string;
  stampedOn: string;
  stampSerial: string;
}

/** A split is a whole percentage of the profit: all of it at the most, none of it at the least. */
const aSplit = (percent: number) =>
  Number.isInteger(percent) && percent <= 100 && percent >= 0;

const NOTHING_SIGNED: Terms = {
  investorId: "",
  units: "",
  investorsPercent: "",
  arbitrator: "",
  stampValueBdt: "",
  stampedOn: "",
  stampSerial: "",
};

/**
 * One Investment Agreement: the Units this person takes of this Venture, the split those Units earn, the
 * Arbitrator both sides name, and the stamped instrument — its value, day and serial, with a photo of the
 * paper itself, because the paper is what a court would ask for.
 */
export const SignAgreementSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string; units: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  // Where the farm starts a new Agreement. A starting point and nothing more: what is typed here is what
  // the Investor signs, and what he signed is what governs afterwards.
  const farm = useQuery(orpc.farm.current.queryOptions());
  // The farm answers with less than its Parameters to somebody they are not for, so the figure is read
  // only where it is actually there rather than assumed onto every shape of the answer.
  const startsAt =
    farm.data && "ventureInvestorsPercent" in farm.data
      ? farm.data.ventureInvestorsPercent
      : undefined;
  const [terms, setTerms] = useState<Terms>(NOTHING_SIGNED);
  const [paper, setPaper] = useState<Photo | null>(null);
  const investors = useQuery(orpc.investors.list.queryOptions());
  const keeping = useMutation(
    orpc.ventures.keepAgreementPaper.mutationOptions()
  );
  const signing = useMutation(
    orpc.ventures.sign.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async (signed) => {
        // The photo goes up against the Agreement it proves, so it is kept once there is an id to keep
        // it against. A signature without its photo is still a signature; the Owner can add it later.
        if (paper) {
          await keeping.mutateAsync({ agreementId: signed.id, ...paper });
        }
        setTerms(NOTHING_SIGNED);
        setPaper(null);
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.investors.key() });
        toast.success(t("ventures.signed"));
      },
    })
  );
  const units = Number(terms.units);
  // Nothing typed yet reads as the farm's own starting point, so the field always shows the figure that
  // would actually be signed. Clearing it goes back to that rather than to a blank the Owner might miss.
  const split =
    terms.investorsPercent === "" && startsAt !== undefined
      ? String(startsAt)
      : terms.investorsPercent;
  const percent = Number(split);
  const ready =
    venture !== null &&
    terms.investorId !== "" &&
    units > 0 &&
    split !== "" &&
    aSplit(percent) &&
    terms.arbitrator.trim() !== "" &&
    Number(terms.stampValueBdt) > 0 &&
    terms.stampedOn !== "" &&
    terms.stampSerial.trim() !== "";
  return (
    <FormSheet
      description={t("ventures.signHint", { venture: venture?.name ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        signing.mutate({
          ventureId: venture?.id ?? "",
          investorId: terms.investorId,
          units,
          investorsPercent: percent,
          arbitrator: terms.arbitrator,
          stampValueBdt: Number(terms.stampValueBdt),
          stampedOn: terms.stampedOn,
          stampSerial: terms.stampSerial,
        })
      }
      open={open}
      pending={signing.isPending || keeping.isPending}
      ready={ready}
      submitLabel={t("ventures.sign")}
      title={t("ventures.sign")}
    >
      <FormField
        hint={t("ventures.investorHint")}
        id="agreement-investor"
        label={t("ventures.investor")}
      >
        <NativeSelect
          id="agreement-investor"
          onChange={(event) =>
            setTerms({ ...terms, investorId: event.target.value })
          }
          value={terms.investorId}
        >
          <option value="">—</option>
          {(investors.data?.people ?? []).map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="agreement-units" label={t("ventures.unitsTaken")}>
          <Input
            id="agreement-units"
            inputMode="numeric"
            max={venture?.units}
            min={1}
            onChange={(event) =>
              setTerms({ ...terms, units: event.target.value })
            }
            type="number"
            value={terms.units}
          />
        </FormField>
        <FormField
          hint={t("ventures.splitHint", {
            // In the reader's own numerals: the sentence around it is Bangla, and it now shows from the
            // moment the sheet opens rather than only once somebody has typed.
            farm: split === "" ? "—" : formatNumber(100 - percent, language),
          })}
          id="agreement-percent"
          label={t("ventures.investorsPercent")}
        >
          <Input
            id="agreement-percent"
            inputMode="numeric"
            max={100}
            min={0}
            onChange={(event) =>
              setTerms({ ...terms, investorsPercent: event.target.value })
            }
            type="number"
            value={split}
          />
        </FormField>
      </div>
      <FormField
        hint={t("ventures.arbitratorHint")}
        id="agreement-arbitrator"
        label={t("ventures.arbitrator")}
      >
        <Input
          autoComplete="off"
          id="agreement-arbitrator"
          onChange={(event) =>
            setTerms({ ...terms, arbitrator: event.target.value })
          }
          value={terms.arbitrator}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="agreement-stamp-value" label={t("ventures.stampValue")}>
          <Input
            id="agreement-stamp-value"
            inputMode="numeric"
            onChange={(event) =>
              setTerms({ ...terms, stampValueBdt: event.target.value })
            }
            type="number"
            value={terms.stampValueBdt}
          />
        </FormField>
        <FormField id="agreement-stamped-on" label={t("ventures.stampedOn")}>
          <Input
            id="agreement-stamped-on"
            onChange={(event) =>
              setTerms({ ...terms, stampedOn: event.target.value })
            }
            type="date"
            value={terms.stampedOn}
          />
        </FormField>
      </div>
      <FormField id="agreement-stamp-serial" label={t("ventures.stampSerial")}>
        <Input
          autoComplete="off"
          id="agreement-stamp-serial"
          onChange={(event) =>
            setTerms({ ...terms, stampSerial: event.target.value })
          }
          value={terms.stampSerial}
        />
      </FormField>
      <FormField
        hint={t("ventures.paperHint")}
        id="agreement-paper"
        label={t("ventures.paper")}
      >
        <PhotoField
          chosen={paper !== null}
          id="agreement-paper"
          onPhoto={setPaper}
          takeLabel="ventures.paperTake"
        />
      </FormField>
    </FormSheet>
  );
};
