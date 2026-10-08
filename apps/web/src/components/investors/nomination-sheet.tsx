import { farmDayOf, namesAMinor } from "@OpenFarm/domain";
import type { PaperDocument } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { FileText, Handshake } from "lucide-react";
import { useState } from "react";

import type { Investor } from "@/components/investors/investor-types";
import { FormField, FormSection, FormSheet } from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import type { WordingSaid } from "@/components/ventures/paper-dialog";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import type { Photo } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import type { NomineeDraft } from "./nominee-draft";
import { draftsOf, draftsProblem, nomineesOf } from "./nominee-draft";
import { NomineesForm } from "./nominees-form";

/** A paper laid out to print, and the wording it was laid out in. */
interface LaidOut {
  paper: PaperDocument;
  wording: WordingSaid;
}

/** The মনোনয়নপত্র laid out from the Nominees written down so far, to print and have signed today. */
const PrintToSign = ({
  investorId,
  drafts,
  today,
}: {
  investorId: string;
  drafts: NomineeDraft[];
  today: string;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [shown, setShown] = useState<LaidOut | null>(null);
  const laying = useMutation(
    orpc.investors.nominationToSign.mutationOptions({
      onSuccess: (done) =>
        setShown({ paper: done.document, wording: done.wording }),
      onError: refused,
    })
  );
  const mayPrint = draftsProblem(drafts, today) === null;
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={!mayPrint || laying.isPending}
        onClick={() =>
          laying.mutate({ id: investorId, nominees: nomineesOf(drafts, today) })
        }
        type="button"
        variant="outline"
      >
        <FileText aria-hidden data-icon="inline-start" />
        {t("nominees.print")}
      </Button>
      <p className="text-muted-foreground text-sm">{t("nominees.printHint")}</p>
      <PaperDialog
        onClose={() => setShown(null)}
        paper={shown?.paper ?? null}
        title={t("nominees.paperTitle")}
        wording={shown?.wording ?? null}
      />
    </div>
  );
};

/** How the Investor gives a মনোনয়নপত্র: signed on paper in front of the Owner, or agreed in the app (ADR 0022). */
type Way = "paper" | "app";

/**
 * The two ways side by side, each with a line of what it asks: paper, or the app — the app out of reach for a list
 * naming a minor, whose Receiver signs on paper, and saying so.
 */
const WayChoice = ({
  way,
  onWay,
  minor,
}: {
  way: Way;
  onWay: (way: Way) => void;
  minor: boolean;
}) => {
  const { t } = useLanguage();
  const ways = [
    {
      value: "paper",
      icon: FileText,
      label: t("nominees.way.paper"),
      hint: t("nominees.way.paperHint"),
      disabled: false,
    },
    {
      value: "app",
      icon: Handshake,
      label: t("nominees.way.app"),
      hint: t(minor ? "nominees.offerMinor" : "nominees.offerInAppHint"),
      disabled: minor,
    },
  ] as const;
  return (
    <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      <legend className="sr-only">{t("nominees.section.how")}</legend>
      {ways.map((one) => (
        <label
          className={cn(
            "has-[:focus-visible]:ring-ring flex gap-3 rounded-lg border p-3 transition-colors duration-150 has-[:focus-visible]:ring-2",
            way === one.value
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50",
            one.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
          )}
          key={one.value}
        >
          <input
            checked={way === one.value}
            className="mt-0.5"
            disabled={one.disabled}
            name="nomination-way"
            onChange={() => onWay(one.value)}
            type="radio"
            value={one.value}
          />
          <one.icon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="flex flex-col gap-1 text-sm font-medium">
            {one.label}
            <span className="text-muted-foreground text-xs font-normal">
              {one.hint}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
};

/**
 * A new মনোনয়নপত্র for one Investor: every Nominee they want written down, starting from the list in force, printed
 * for them to sign in front of the Owner, and recorded with the day they signed and — now or later — a photo of it.
 * From then on it is the list in force for all their Agreements.
 */
export const NominationSheet = ({
  investor,
  open,
  onOpenChange,
  inTheApp = false,
}: {
  investor: Investor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether it may be offered in the app instead: the farm's switch on, and the Investor in the portal. */
  inTheApp?: boolean;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const today = farmDayOf(new Date());
  const startFrom = () => draftsOf(investor.nomination?.nominees ?? []);
  const [drafts, setDrafts] = useState<NomineeDraft[]>(startFrom);
  const [signedOn, setSignedOn] = useState(today);
  const [photo, setPhoto] = useState<Photo | null>(null);
  useFreshFor(open ? investor.id : undefined, () => {
    setDrafts(startFrom());
    setSignedOn(today);
    setPhoto(null);
  });
  const [way, setWay] = useState<Way>("paper");
  useFreshFor(open ? investor.id : undefined, () => setWay("paper"));
  const recording = useMutation(
    orpc.investors.recordNomination.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("nominees.recorded"));
        onOpenChange(false);
      },
    })
  );
  const refusedOffer = useRefused({
    minor_signs_on_paper: "nominees.offerMinor",
    nomination_offer_standing: "nominees.offerStanding",
    agreements_in_app_off: "agreeInApp.refusal.agreements_in_app_off",
    investor_not_in_portal: "agreeInApp.refusal.investor_not_in_portal",
    investor_retired: "nominees.offerRetired",
  });
  const offering = useMutation(
    orpc.investors.offerNomination.mutationOptions({
      onError: refusedOffer,
      onSuccess: () => {
        toast.success(t("nominees.offered"));
        onOpenChange(false);
      },
    })
  );
  // Judged on the day it was signed, as the farm judges it: a Nominee who turned eighteen since is of age on the paper.
  const onDay = signedOn === "" ? today : signedOn;
  // Offered in the app it is judged today, the day the Investor reads it; a minor's list signs on paper.
  const minor = namesAMinor(nomineesOf(drafts, today), today);
  const inApp = inTheApp && way === "app" && !minor;
  // The photo may follow: the paper is in force from its signature, and the Investor's page asks for the photo.
  const ready = inApp
    ? draftsProblem(drafts, today) === null
    : signedOn !== "" && draftsProblem(drafts, onDay) === null;
  return (
    <FormSheet
      description={t("nominees.newHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (inApp) {
          offering.mutate({
            id: investor.id,
            nominees: nomineesOf(drafts, today),
          });
          return;
        }
        recording.mutate({
          id: investor.id,
          nominees: nomineesOf(drafts, onDay),
          signedOn,
          ...photo,
        });
      }}
      open={open}
      pending={inApp ? offering.isPending : recording.isPending}
      ready={ready}
      submitLabel={t(inApp ? "nominees.offerInApp" : "nominees.record")}
      title={t("nominees.newTitle", { name: investor.name })}
      wide
    >
      <FormSection
        description={t("nominees.section.whoHint")}
        title={t("nominees.section.who")}
      >
        <div className="sm:col-span-2">
          <NomineesForm drafts={drafts} onChange={setDrafts} onDay={onDay} />
        </div>
      </FormSection>
      <FormSection
        title={t(
          inTheApp ? "nominees.section.how" : "nominees.section.onPaper"
        )}
      >
        {inTheApp ? (
          <WayChoice
            minor={minor}
            onWay={setWay}
            way={inApp ? "app" : "paper"}
          />
        ) : null}
        {inApp ? null : (
          <>
            <div className="sm:col-span-2">
              <PrintToSign
                drafts={drafts}
                investorId={investor.id}
                today={today}
              />
            </div>
            <FormField id="nomination-signed-on" label={t("nominees.signedOn")}>
              <Input
                id="nomination-signed-on"
                max={today}
                onChange={(event) => setSignedOn(event.target.value)}
                type="date"
                value={signedOn}
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField
                hint={t("nominees.photoHint")}
                id="nomination-photo"
                label={t("nominees.photo")}
              >
                <PhotoField
                  chosen={photo !== null}
                  id="nomination-photo"
                  onPhoto={setPhoto}
                  takeLabel="nominees.photoTake"
                />
              </FormField>
            </div>
          </>
        )}
      </FormSection>
    </FormSheet>
  );
};
