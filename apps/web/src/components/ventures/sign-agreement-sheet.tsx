import type { NomineesProblem, PaperDocument } from "@OpenFarm/domain";
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
import type { StillMissing } from "@/components/page-kit";
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
  /** Offered to agree to in the app instead, with no stamp: the farm's switch is on. */
  inApp: boolean;
  stampValueMoney: string;
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

/** Why the farm would not offer an Agreement to agree to in the app, in the Owner's words. */
const OFFER_REFUSALS = {
  agreements_in_app_off: "agreeInApp.refusal.agreements_in_app_off",
  investor_not_in_portal: "agreeInApp.refusal.investor_not_in_portal",
  offer_already_made: "agreeInApp.refusal.offer_already_made",
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
  inApp: false,
  stampValueMoney: "",
  stampedOn: "",
  stampSerial: "",
};

/** The day its Nominees are judged on, as the farm judges them: the day it is stamped — before a day is typed, or
 *  offered in the app, today. */
const judgedOn = (terms: Terms, today: string) =>
  terms.inApp || terms.stampedOn === "" ? today : terms.stampedOn;

/** The field of a Nominee's row each of the farm's objections is about. */
const NOMINEE_FIELD: Record<NomineesProblem["code"], string> = {
  too_many: "name",
  name_missing: "name",
  born_missing: "born",
  born_in_future: "born",
  shares_not_whole: "share",
  shares_not_hundred: "share",
  receiver_missing: "receiver-name",
  receiver_not_needed: "receiver-name",
};

/** The first of the stamp's three boxes still empty, and the box. */
const stampMissing = (
  terms: Terms,
  t: ReturnType<typeof useLanguage>["t"]
): StillMissing | null => {
  if (!(Number(terms.stampValueMoney) > 0)) {
    return {
      said: t("ventures.missing.stampValue"),
      at: "agreement-stamp-value",
    };
  }
  if (terms.stampedOn === "") {
    return {
      said: t("ventures.missing.stampedOn"),
      at: "agreement-stamped-on",
    };
  }
  if (terms.stampSerial.trim() === "") {
    return {
      said: t("ventures.missing.stampSerial"),
      at: "agreement-stamp-serial",
    };
  }
  return null;
};

/**
 * The first thing the paper still needs before it can be signed, in the order the sheet asks for it, and the field it
 * is about — said when "Sign" is pressed too soon, rather than the button standing grey with its reason above it.
 */
const stillMissing = (
  terms: Terms,
  {
    units,
    split,
    percent,
    left,
    nominees,
  }: {
    units: number;
    /** The split as the box holds it: empty is no split, though it reads as nothing. */
    split: string;
    percent: number;
    left: number;
    nominees: NomineesProblem | null;
  },
  { t, language }: Pick<ReturnType<typeof useLanguage>, "t" | "language">
): StillMissing | null => {
  if (terms.investorId === "") {
    return { said: t("ventures.missing.investor"), at: "agreement-investor" };
  }
  if (!(units > 0)) {
    return { said: t("ventures.missing.units"), at: "agreement-units" };
  }
  if (units > left) {
    return {
      said: t("ventures.missing.unitsLeft", {
        left: formatNumber(left, language),
      }),
      at: "agreement-units",
    };
  }
  if (split === "" || !aSplit(percent)) {
    return { said: t("ventures.missing.split"), at: "agreement-percent" };
  }
  if (terms.arbitrator.trim() === "") {
    return {
      said: t("ventures.missing.arbitrator"),
      at: "agreement-arbitrator",
    };
  }
  if (nominees) {
    const place = nominees.at ?? 1;
    return {
      said: `${nominees.at ? `${t("nominees.place", { place: nominees.at })}: ` : ""}${t(`nominees.problem.${nominees.code}`)}`,
      at: `nominee-${place}-${NOMINEE_FIELD[nominees.code]}`,
    };
  }
  return terms.inApp ? null : stampMissing(terms, t);
};

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
  // Whether an Agreement may be offered to agree to in the app instead, as the Owner has set the farm.
  const inAppOn = investors.data?.agreementsInApp ?? false;
  const signed = signedSoFar.data ?? [];
  const alreadyIn = new Set(signed.map((one) => one.investorId));
  const signable = (investors.data?.people ?? []).filter(
    (one) => !(one.retiredAt || alreadyIn.has(one.id))
  );
  return {
    signable,
    inAppOn,
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

/** The stamped instrument: its value, day and serial, in the words of the way its duty was paid, and a photograph of the
 *  paper itself. */
const TheStamp = ({
  terms,
  onChange,
  paper,
  onPaper,
}: {
  terms: Terms;
  onChange: (terms: Terms) => void;
  paper: Photo | null;
  onPaper: (photo: Photo | null) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          id="agreement-stamp-value"
          label={t(STAMP_LABELS[terms.stampKind].value)}
        >
          <Input
            id="agreement-stamp-value"
            inputMode="numeric"
            onChange={(event) =>
              onChange({ ...terms, stampValueMoney: event.target.value })
            }
            type="number"
            value={terms.stampValueMoney}
          />
        </FormField>
        <FormField
          id="agreement-stamped-on"
          label={t(STAMP_LABELS[terms.stampKind].on)}
        >
          <Input
            id="agreement-stamped-on"
            onChange={(event) =>
              onChange({ ...terms, stampedOn: event.target.value })
            }
            type="date"
            value={terms.stampedOn}
          />
        </FormField>
        <FormField
          id="agreement-stamp-serial"
          label={t(STAMP_LABELS[terms.stampKind].serial)}
        >
          <Input
            autoComplete="off"
            id="agreement-stamp-serial"
            onChange={(event) =>
              onChange({ ...terms, stampSerial: event.target.value })
            }
            value={terms.stampSerial}
          />
        </FormField>
      </div>
      <FormField
        hint={t("ventures.paperHint")}
        id="agreement-paper"
        label={t("ventures.paper")}
      >
        <PhotoField
          chosen={paper !== null}
          id="agreement-paper"
          onPhoto={onPaper}
          takeLabel="ventures.paperTake"
        />
      </FormField>
    </>
  );
};

/**
 * How the Agreement is made: on stamp paper, by e-challan, or — while the farm's switch is on — agreed in the app, with
 * no stamp to write down and the Investor agreeing in the portal.
 */
const HowItIsMade = ({
  terms,
  inApp,
  inAppOn,
  onChange,
  paper,
  onPaper,
}: {
  terms: Terms;
  inApp: boolean;
  inAppOn: boolean;
  onChange: (terms: Terms) => void;
  paper: Photo | null;
  onPaper: (photo: Photo | null) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" data-slot="form-label">
          {t("ventures.stampKind")}
        </span>
        <SegmentedControl
          label={t("ventures.stampKind")}
          name="agreement-stamp-kind"
          onChange={(route) =>
            onChange(
              route === "in_app"
                ? { ...terms, inApp: true }
                : { ...terms, stampKind: route, inApp: false }
            )
          }
          options={[
            { value: "paper", label: t("ventures.stampKind.paper") },
            { value: "e_challan", label: t("ventures.stampKind.e_challan") },
            ...(inAppOn
              ? [{ value: "in_app" as const, label: t("agreeInApp.route") }]
              : []),
          ]}
          value={inApp ? "in_app" : terms.stampKind}
        />
      </div>
      {inApp ? (
        <p className="text-muted-foreground text-sm">
          {t("agreeInApp.sheetHint")}
        </p>
      ) : (
        <TheStamp
          onChange={onChange}
          onPaper={onPaper}
          paper={paper}
          terms={terms}
        />
      )}
    </>
  );
};

/**
 * The sheet's two ways to save: signed on stamp — its photo kept against it once there is an Agreement to keep it
 * against, and its Pay-in Code said — or offered to agree to in the app. Either closes the sheet when done.
 */
const useSaving = (paper: Photo | null, done: () => void) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const refusedOffer = useRefused(OFFER_REFUSALS);
  const keeping = useMutation(
    orpc.ventures.keepAgreementPaper.mutationOptions()
  );
  const offering = useMutation(
    orpc.ventures.offerInApp.mutationOptions({
      onError: refusedOffer,
      onSuccess: () => {
        done();
        toast.success(t("agreeInApp.offered"), {
          description: t("agreeInApp.offeredHint"),
        });
      },
    })
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
        done();
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
  return {
    sign: signing.mutate,
    offer: offering.mutate,
    pending: signing.isPending || keeping.isPending || offering.isPending,
  };
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
  const { signable, left, nobodyLeft, inAppOn } = useWhoMaySign(venture);
  // Offered in the app only while the farm's switch is on: turned off meanwhile, the sheet is a stamped paper again.
  const inApp = terms.inApp && inAppOn;
  const asOffered = { ...terms, inApp };
  const stampDay = judgedOn(asOffered, today);
  const { live, answering, yes } = useTheRequestItAnswers(
    venture,
    terms.investorId,
    terms.answersNone
  );
  const saving = useSaving(paper, () => {
    setTerms(NOTHING_SIGNED);
    setPaper(null);
    onOpenChange(false);
  });
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
  const nomineesWrong = draftsProblem(nomineeDrafts, stampDay);
  // What "Sign" says it still needs when pressed too soon, and which field it goes to; nothing once it is ready. One
  // answer to both, so a button can never stand pressable with nothing to say why it does nothing.
  const missing = stillMissing(
    asOffered,
    { units, split, percent, left, nominees: nomineesWrong },
    { t, language }
  );
  const ready = venture !== null && missing === null;
  return (
    <FormSheet
      description={t("ventures.signHint", { venture: venture?.name ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        const said = {
          ...drafting,
          nominees: nomineesOf(nomineeDrafts, stampDay),
          ...(answering ? { requestId: answering.id } : {}),
        };
        if (inApp) {
          saving.offer(said);
          return;
        }
        saving.sign({
          ...said,
          arbitrator: terms.arbitrator,
          stampKind: terms.stampKind,
          stampValueMoney: Number(terms.stampValueMoney),
          stampedOn: terms.stampedOn,
          stampSerial: terms.stampSerial,
        });
      }}
      open={open}
      pending={saving.pending}
      missing={missing}
      ready={ready}
      submitLabel={inApp ? t("agreeInApp.offer") : t("ventures.sign")}
      title={t("ventures.sign")}
      wide
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
      <HowItIsMade
        inApp={inApp}
        inAppOn={inAppOn}
        onChange={setTerms}
        onPaper={setPaper}
        paper={paper}
        terms={terms}
      />
    </FormSheet>
  );
};
