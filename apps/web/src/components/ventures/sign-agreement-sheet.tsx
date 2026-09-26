import type { PaperDocument } from "@OpenFarm/domain";
import { farmDayOf, isLiveRequest } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { NomineeDraft } from "@/components/investors/nominee-draft";
import {
  draftsOf,
  draftsProblem,
  nomineesOf,
} from "@/components/investors/nominee-draft";
import { NomineesForm } from "@/components/investors/nominees-form";
import { SegmentedControl } from "@/components/page";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import type { WordingSaid } from "@/components/ventures/paper-dialog";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import type { Photo } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

interface Terms {
  investorId: string;
  /** The Owner said the paper answers no Request, though the Investor has one live: they joined another way. */
  answersNone: boolean;
  units: string;
  investorsPercent: string;
  arbitrator: string;
  stampKind: StampKind;
  stampValueBdt: string;
  stampedOn: string;
  stampSerial: string;
}

/** Stamp paper by its serial, or duty paid by e-challan by the challan's number. */
type StampKind = "paper" | "e_challan";

/** The three stamp boxes' names, which say what is being asked for either way. */
const STAMP_LABELS = {
  paper: {
    value: "ventures.stampValue",
    on: "ventures.stampedOn",
    serial: "ventures.stampSerial",
  },
  e_challan: {
    value: "ventures.dutyPaid",
    on: "ventures.paidOn",
    serial: "ventures.challanNumber",
  },
} as const satisfies Record<
  StampKind,
  Record<"value" | "on" | "serial", MessageKey>
>;

/** A paper laid out to print, and the wording it was laid out in. */
interface LaidOut {
  paper: PaperDocument;
  wording: WordingSaid;
}

/** Why the farm would not lay out the notice, in the Owner's words. */
const NOTICE_REFUSALS = {
  notice_unwritten: "ventures.noticeUnwritten",
} as const;

/** Long enough to read a code out to somebody and have them write it down. */
const CODE_SHOWN_FOR_MS = 20_000;

/** A split is a whole percentage of the profit: all of it at the most, none of it at the least. */
const aSplit = (percent: number) =>
  Number.isInteger(percent) && percent <= 100 && percent >= 0;

const NOTHING_SIGNED: Terms = {
  investorId: "",
  answersNone: false,
  units: "",
  investorsPercent: "",
  arbitrator: "",
  stampKind: "paper",
  stampValueBdt: "",
  stampedOn: "",
  stampSerial: "",
};

/**
 * Whether the paper is filled in enough to be signed: somebody to sign it, Units to take, a whole
 * percentage between none and all, an Arbitrator both sides name, and a stamp with a value, a day and a
 * serial. The photograph is not among them — a stamped paper the farm has not photographed yet is still
 * a signed one, and the Agreement sheet says so separately.
 */
const fitToSign = (
  terms: Terms,
  { units, percent, left }: { units: number; percent: number; left: number }
) =>
  terms.investorId !== "" &&
  units > 0 &&
  // Named, and this way round, because the guard against untranslated JSX text reads a closing angle
  // bracket in an expression as the end of a tag.
  left >= units &&
  aSplit(percent) &&
  terms.arbitrator.trim() !== "" &&
  Number(terms.stampValueBdt) > 0 &&
  terms.stampedOn !== "" &&
  terms.stampSerial.trim() !== "";

/**
 * Who may still sign one Venture, and how many of its Units are left for them.
 *
 * Nobody retired, and nobody who has signed it already: a second Agreement for the same person is refused,
 * and so are Units beyond what is left, so the form offers neither. `nobodyLeft` is said only once the list
 * has answered, so a sheet still loading does not tell the Owner everybody has signed.
 */
const useWhoMaySign = (venture: { id: string; units: number } | null) => {
  const investors = useQuery(orpc.investors.list.queryOptions());
  const signedSoFar = useQuery({
    ...orpc.ventures.agreements.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const signed = signedSoFar.data ?? [];
  const alreadyIn = new Set(signed.map((one) => one.investorId));
  const signable = (investors.data?.people ?? []).filter(
    (one) => !(one.retiredAt || alreadyIn.has(one.id))
  );
  return {
    signable,
    left:
      (venture?.units ?? 0) - signed.reduce((sum, one) => sum + one.units, 0),
    nobodyLeft: investors.isSuccess && signable.length === 0,
  };
};

/** One Investor's live Request on the Venture being signed, as the Owner's list reads it. */
type LiveRequest = Awaited<
  ReturnType<typeof orpc.ventures.requests.call>
>["requests"][number];

/**
 * The chosen Investor's live Request on this Venture — one at the most — and whether the paper answers it. Their live
 * Request is the one the paper most likely answers, so it does unless the Owner says none; worked out on every draw
 * rather than when the Investor was chosen, so a list that answers late, or a Request withdrawn meanwhile, is what is
 * sent. With the Units of the yes it answers, for a Units box nobody has typed in.
 */
const useTheRequestItAnswers = (
  venture: { id: string } | null,
  investorId: string,
  answersNone: boolean
) => {
  const requests = useQuery({
    ...orpc.ventures.requests.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const live = (requests.data?.requests ?? []).find(
    (one) => one.investorId === investorId && isLiveRequest(one.state)
  );
  const answering = live && !answersNone ? live : undefined;
  return {
    live,
    answering,
    yes: answering?.state === "come_and_sign" ? answering.answeredUnits : null,
  };
};

/**
 * The Request the paper answers, offered once the Investor chosen has a live one on this Venture: at most one, since an
 * Investor holds one live Request per Venture. With the yes's Units beside it — or, nobody having answered, the Units
 * asked — and "none" for somebody who joined another way, whose paper then names no Request though theirs still reads
 * signed. The paper's Units stand whatever it says.
 */
const AnswersRequest = ({
  live,
  answering,
  onChange,
}: {
  live: LiveRequest;
  answering: boolean;
  onChange: (answering: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <FormField
      hint={t("ventures.signRequestHint")}
      id="agreement-request"
      label={t("ventures.signAnswers")}
    >
      <NativeSelect
        id="agreement-request"
        onChange={(event) => onChange(event.target.value !== "")}
        value={answering ? live.id : ""}
      >
        <option value="">{t("ventures.signNoRequest")}</option>
        <option value={live.id}>
          {live.state === "come_and_sign" && live.answeredUnits !== null
            ? t("ventures.signAnswersYes", {
                units: formatNumber(live.answeredUnits, language),
              })
            : t("ventures.signAnswersWaiting", {
                units: formatNumber(live.units, language),
              })}
        </option>
      </NativeSelect>
    </FormField>
  );
};

/**
 * The agreement to sign, laid out from the terms on the sheet in the farm's current wording, and printed onto stamp
 * paper or to go with an e-challan. Until a lawyer has approved that wording the dialog says so, above the page and
 * never on it. Beside it the dialog offers «আপনার তথ্য», the notice the Agreement's data section points to, to print
 * and hand over with it — in the same dialog, since a page is printed by finding the one paper on the screen.
 */
const PrintToSign = ({
  drafting,
  splitGiven,
  nomineeDrafts,
  today,
}: {
  drafting: {
    ventureId: string;
    investorId: string;
    units: number;
    investorsPercent: number;
    arbitrator: string;
  };
  splitGiven: boolean;
  /** The Nominees it will name, as written on the sheet, judged on the day it is printed. */
  nomineeDrafts: NomineeDraft[];
  today: string;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const refusedNotice = useRefused(NOTICE_REFUSALS);
  const [shown, setShown] = useState<LaidOut | null>(null);
  const [notice, setNotice] = useState<LaidOut | null>(null);
  const laying = useMutation(
    orpc.investorStatements.agreementToSign.mutationOptions({
      onSuccess: (done) =>
        setShown({ paper: done.document, wording: done.wording }),
      onError: refused,
    })
  );
  const layingNotice = useMutation(
    orpc.investorStatements.noticeToHand.mutationOptions({
      onSuccess: (done) =>
        setNotice({ paper: done.document, wording: done.wording }),
      onError: refusedNotice,
    })
  );
  const mayDraft =
    draftsProblem(nomineeDrafts, today) === null &&
    drafting.ventureId !== "" &&
    drafting.investorId !== "" &&
    drafting.units > 0 &&
    splitGiven &&
    aSplit(drafting.investorsPercent) &&
    drafting.arbitrator !== "";
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={!mayDraft || laying.isPending}
        onClick={() =>
          laying.mutate({
            ...drafting,
            nominees: nomineesOf(nomineeDrafts, today),
          })
        }
        type="button"
        variant="outline"
      >
        <FileText aria-hidden data-icon="inline-start" />
        {t("ventures.printDraft")}
      </Button>
      <p className="text-muted-foreground text-sm">
        {t("ventures.printDraftHint")}
      </p>
      <PaperDialog
        action={
          notice ? (
            <Button
              onClick={() => setNotice(null)}
              type="button"
              variant="outline"
            >
              <ArrowLeft aria-hidden data-icon="inline-start" />
              {t("ventures.backToAgreement")}
            </Button>
          ) : (
            <Button
              disabled={layingNotice.isPending}
              onClick={() =>
                layingNotice.mutate({
                  ventureId: drafting.ventureId,
                  investorId: drafting.investorId,
                })
              }
              type="button"
              variant="outline"
            >
              <FileText aria-hidden data-icon="inline-start" />
              {t("ventures.noticeBeside")}
            </Button>
          )
        }
        description={notice ? t("ventures.noticeBesideHint") : undefined}
        onClose={() => {
          setShown(null);
          setNotice(null);
        }}
        paper={notice?.paper ?? shown?.paper ?? null}
        title={
          notice ? t("ventures.noticeTitle") : t("ventures.agreementTitle")
        }
        wording={notice?.wording ?? shown?.wording ?? null}
      />
    </div>
  );
};

/** The Nominees the Agreement names, once somebody is chosen to sign: their list in force, to change for this signing. */
const TheNomineesItNames = ({
  chosen,
  drafts,
  onChange,
  onDay,
}: {
  chosen: boolean;
  drafts: NomineeDraft[];
  onChange: (drafts: NomineeDraft[]) => void;
  onDay: string;
}) => {
  const { t } = useLanguage();
  if (!chosen) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium" data-slot="form-label">
        {t("nominees.title")}
      </span>
      <p className="text-muted-foreground text-xs">
        {t("ventures.signNomineesHint")}
      </p>
      <NomineesForm drafts={drafts} onChange={onChange} onDay={onDay} />
    </div>
  );
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
  const refused = useRefused();
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
  // The Nominees it names: the chosen Investor's list in force, which the Owner may change for this signing.
  const [nomineeDrafts, setNomineeDrafts] = useState<NomineeDraft[]>([]);
  useFreshFor(venture?.id, () => {
    setTerms(NOTHING_SIGNED);
    setPaper(null);
    setNomineeDrafts([]);
  });
  const today = farmDayOf(new Date());
  // Judged on the day it is stamped, as the farm judges it; before a day is typed, on today.
  const stampDay = terms.stampedOn === "" ? today : terms.stampedOn;
  const { signable, left, nobodyLeft } = useWhoMaySign(venture);
  const { live, answering, yes } = useTheRequestItAnswers(
    venture,
    terms.investorId,
    terms.answersNone
  );
  const keeping = useMutation(
    orpc.ventures.keepAgreementPaper.mutationOptions()
  );
  const signing = useMutation(
    orpc.ventures.sign.mutationOptions({
      onError: refused,
      onSuccess: async (signed) => {
        // The photo goes up against the Agreement it proves, so it is kept once there is an id to keep
        // it against. A signature without its photo is still a signature; the Owner can add it later —
        // so a photo that fails to go up is said, and the sheet still closes. Left open and filled in, it
        // invites the same signature a second time.
        if (paper) {
          try {
            await keeping.mutateAsync({ agreementId: signed.id, ...paper });
          } catch {
            toast.warning(t("ventures.signedWithoutPaper"));
          }
        }
        setTerms(NOTHING_SIGNED);
        setPaper(null);
        onOpenChange(false);
        // The Pay-in Code is said here, where the Investor is still sitting across the table, and kept on their row.
        toast.success(
          t("ventures.signedWithCode", { code: signed.payInCode }),
          {
            description: t("ventures.payInCodeHint"),
            duration: CODE_SHOWN_FOR_MS,
          }
        );
      },
    })
  );
  // Units nobody has typed read as the yes being answered, as an empty split reads as the farm's own: the box shows
  // what would be signed, and clearing it goes back to the yes.
  const unitsSaid =
    terms.units === "" && yes !== null ? String(yes) : terms.units;
  const units = Number(unitsSaid);
  // Nothing typed yet reads as the farm's own starting point, so the field always shows the figure that
  // would actually be signed. Clearing it goes back to that rather than to a blank the Owner might miss.
  const split =
    terms.investorsPercent === "" && startsAt !== undefined
      ? String(startsAt)
      : terms.investorsPercent;
  const percent = Number(split);
  const drafting = {
    ventureId: venture?.id ?? "",
    investorId: terms.investorId,
    units,
    investorsPercent: percent,
    arbitrator: terms.arbitrator.trim(),
  };
  const ready =
    venture !== null &&
    split !== "" &&
    draftsProblem(nomineeDrafts, stampDay) === null &&
    fitToSign(terms, { units, percent, left });
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
          stampKind: terms.stampKind,
          stampValueBdt: Number(terms.stampValueBdt),
          stampedOn: terms.stampedOn,
          stampSerial: terms.stampSerial,
          nominees: nomineesOf(nomineeDrafts, stampDay),
          ...(answering ? { requestId: answering.id } : {}),
        })
      }
      open={open}
      pending={signing.isPending || keeping.isPending}
      ready={ready}
      submitLabel={t("ventures.sign")}
      title={t("ventures.sign")}
    >
      <FormField
        hint={
          nobodyLeft
            ? t("ventures.nobodyLeftToSign")
            : t("ventures.investorHint")
        }
        id="agreement-investor"
        label={t("ventures.investor")}
      >
        <NativeSelect
          id="agreement-investor"
          onChange={(event) => {
            const chosen = signable.find(
              (one) => one.id === event.target.value
            );
            setTerms({
              ...terms,
              investorId: event.target.value,
              answersNone: false,
            });
            setNomineeDrafts(draftsOf(chosen?.nomination?.nominees ?? []));
          }}
          value={terms.investorId}
        >
          <option value="">—</option>
          {/* A retired Investor is not signed for anything until the Owner brings them back, and somebody who has
              signed this Venture already signs no second Agreement for it. */}
          {signable.map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {live ? (
        <AnswersRequest
          answering={answering !== undefined}
          live={live}
          onChange={(answers) => setTerms({ ...terms, answersNone: !answers })}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          hint={t("ventures.unitsLeft", {
            left: formatNumber(Math.max(left, 0), language),
          })}
          id="agreement-units"
          label={t("ventures.unitsTaken")}
        >
          <Input
            id="agreement-units"
            inputMode="numeric"
            max={Math.max(left, 0)}
            min={1}
            onChange={(event) =>
              setTerms({ ...terms, units: event.target.value })
            }
            type="number"
            value={unitsSaid}
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
      <TheNomineesItNames
        chosen={terms.investorId !== ""}
        drafts={nomineeDrafts}
        onChange={setNomineeDrafts}
        onDay={stampDay}
      />
      <PrintToSign
        drafting={drafting}
        nomineeDrafts={nomineeDrafts}
        splitGiven={split !== ""}
        today={today}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" data-slot="form-label">
          {t("ventures.stampKind")}
        </span>
        <SegmentedControl
          label={t("ventures.stampKind")}
          name="agreement-stamp-kind"
          onChange={(stampKind) => setTerms({ ...terms, stampKind })}
          options={[
            { value: "paper", label: t("ventures.stampKind.paper") },
            { value: "e_challan", label: t("ventures.stampKind.e_challan") },
          ]}
          value={terms.stampKind}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="agreement-stamp-value"
          label={t(STAMP_LABELS[terms.stampKind].value)}
        >
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
        <FormField
          id="agreement-stamped-on"
          label={t(STAMP_LABELS[terms.stampKind].on)}
        >
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
      <FormField
        id="agreement-stamp-serial"
        label={t(STAMP_LABELS[terms.stampKind].serial)}
      >
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
