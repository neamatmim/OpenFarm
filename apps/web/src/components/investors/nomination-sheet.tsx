import { farmDayOf } from "@OpenFarm/domain";
import type { PaperDocument } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Investor } from "@/components/investors/investor-types";
import { FormField, FormSheet } from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import type { WordingSaid } from "@/components/ventures/paper-dialog";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import type { Photo } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
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

/**
 * A new মনোনয়নপত্র for one Investor: every Nominee they want written down, starting from the list in force, printed
 * for them to sign in front of the Owner, and recorded with the day they signed and a photo of it. From then on it is
 * the list in force for all their Agreements.
 */
export const NominationSheet = ({
  investor,
  open,
  onOpenChange,
}: {
  investor: Investor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const recording = useMutation(
    orpc.investors.recordNomination.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("nominees.recorded"));
        onOpenChange(false);
      },
    })
  );
  // Judged on the day it was signed, as the farm judges it: a Nominee who turned eighteen since is of age on the paper.
  const onDay = signedOn === "" ? today : signedOn;
  const ready =
    signedOn !== "" && photo !== null && draftsProblem(drafts, onDay) === null;
  return (
    <FormSheet
      description={t("nominees.newHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (!photo) {
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
      pending={recording.isPending}
      ready={ready}
      submitLabel={t("nominees.record")}
      title={t("nominees.newTitle", { name: investor.name })}
      wide
    >
      <NomineesForm drafts={drafts} onChange={setDrafts} onDay={onDay} />
      <PrintToSign drafts={drafts} investorId={investor.id} today={today} />
      <FormField id="nomination-signed-on" label={t("nominees.signedOn")}>
        <Input
          id="nomination-signed-on"
          max={today}
          onChange={(event) => setSignedOn(event.target.value)}
          type="date"
          value={signedOn}
        />
      </FormField>
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
    </FormSheet>
  );
};
