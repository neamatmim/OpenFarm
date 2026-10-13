import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import { FormDraftNotice } from "@/components/form-draft-notice";
import { BuyingTripSheet } from "@/components/intake/buying-trip";
import type { IntakeFields } from "@/components/intake/intake-fields";
import {
  EMPTY,
  missingFrom,
  nextOffTheLorry,
  typedSince,
  orNothing,
  boughtFromTheAccount,
  owningVenture,
  windowIsWhole,
} from "@/components/intake/intake-fields";
import {
  AnimalSection,
  PriceSection,
  SellerSection,
  TargetSection,
} from "@/components/intake/intake-sections";
import {
  IntakeSummary,
  NEXT_OFF_THE_LORRY,
  TakeInButtons,
} from "@/components/intake/intake-summary";
import { RecentIntakes } from "@/components/intake/recent-intakes";
import { useIsOwner } from "@/components/money";
import { Notice, Page, PageHeader } from "@/components/page";
import { UnsavedChangesGuard } from "@/components/page-kit";
import { accountSent } from "@/components/payment-method";
import { PastOutings } from "@/components/trips/past-outings";
import { useT } from "@/i18n/language-provider";
import { momentOfField } from "@/lib/farm-moment";
import { matchesFormFields } from "@/lib/form-draft";
import { onlyFor } from "@/lib/guard";
import { shrinkAnimalPhoto } from "@/lib/photo";
import { sendOrKeepAnimalPhoto } from "@/lib/record-offline";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { draftKeyFor, useFormDraft } from "@/lib/use-form-draft";
import { client, orpc } from "@/utils/orpc";

/**
 * The two buttons at the foot of the form on a phone and a tablet — take her in, or take her in and stay for the next
 * off the lorry — side by side, held in sight the whole way down it, above the phone's bottom bar, which the kit's
 * `StickyAction` (made for a Step, where the bar steps aside) would sit behind. Beside the form on a wide screen the
 * summary carries them instead, so this bar is not drawn there.
 */
const SubmitBar = ({ children }: { children: ReactNode }) => (
  <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-[calc(3.8rem+max(env(safe-area-inset-bottom),0.25rem))] z-20 -mx-4 border-t px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 lg:hidden">
    {children}
  </div>
);

/**
 * The form's fields, and the lorry's answers kept for the next beast off it. Those are held on the page only, never
 * written to the phone as a draft, so a visit days later does not find last week's seller and outing waiting; once
 * anything is typed over them they are somebody's work, and the draft keeps them like any other.
 */
const useTheLorry = (draft: {
  value: IntakeFields;
  setValue: (next: IntakeFields) => void;
  clear: () => void;
}) => {
  const [held, setHeld] = useState<IntakeFields | null>(null);
  // The beasts taken in off this lorry while the form stayed for the next.
  const [offThisLorry, setOffThisLorry] = useState<string[]>([]);
  return {
    fields: held ?? draft.value,
    startedFrom: held ?? EMPTY,
    offThisLorry,
    setFields: (next: IntakeFields) => {
      if (held !== null && !typedSince(next, held)) {
        return;
      }
      setHeld(null);
      draft.setValue(next);
    },
    /** She is in: hold the lorry's answers, from the form as it was sent, for the next one. */
    next: (sent: IntakeFields, tagNumber: string) => {
      setHeld(nextOffTheLorry(sent));
      setOffThisLorry((before) => [...before, tagNumber]);
    },
    done: () => {
      draft.clear();
      setHeld(null);
      setOffThisLorry([]);
    },
  };
};

/** The arrival as the farm takes it: what was typed, and the sheet's own reading of it — a Venture's window, and a bull
 *  bought from its account paid by bank. */
const intakeSent = (fields: IntakeFields, sheet: IntakeFields) => ({
  penId: fields.penId,
  sex: fields.sex,
  // Read as the farm's day and time, not the phone's (lib/farm-moment): her Quarantine, her money and her
  // outing are dated from it.
  ...(fields.arrivedAt
    ? { arrivedAt: new Date(momentOfField(fields.arrivedAt)) }
    : {}),
  seller: {
    name: fields.sellerName,
    address: fields.sellerPlace || undefined,
    phone: fields.sellerPhone || undefined,
  },
  purchasePriceMoney: Number(fields.purchasePriceMoney),
  marketTollMoney: orNothing(fields.marketTollMoney),
  weightKg: Number(fields.weightKg),
  estimatedAgeMonths: Number(fields.estimatedAgeMonths),
  breedId: fields.breedId || undefined,
  targetWeightKg: orNothing(fields.targetWeightKg),
  targetWindowStart: sheet.targetWindowStart || undefined,
  targetWindowEnd: sheet.targetWindowEnd || undefined,
  buyingTripId: fields.buyingTripId || undefined,
  ventureId: fields.ventureId || undefined,
  paymentMethod: sheet.paymentMethod,
  // A Venture's bull at the gate: the transfer from its account. The Farm's own by mobile money or the bank: the
  // Farm Account it came out of and its transaction ID.
  ...(boughtFromTheAccount(fields)
    ? { reference: fields.reference.trim() }
    : accountSent(sheet.paymentMethod, {
        farmAccountId: fields.farmAccountId,
        reference: fields.reference,
      })),
  paidOn:
    boughtFromTheAccount(fields) && fields.paidOn ? fields.paidOn : undefined,
  // The Manager's cash, where the Owner writes up his lorry: his Friday count looks for it there.
  heldBy:
    sheet.paymentMethod === "cash" && fields.heldBy ? fields.heldBy : undefined,
});

/** The press that sent the form says what comes after it: the second button stays for the next beast; Enter, or the
 *  first, opens her page. */
const whatComesAfter = (submitted: SubmitEvent): "her" | "next" =>
  submitted.submitter instanceof HTMLButtonElement &&
  submitted.submitter.value === NEXT_OFF_THE_LORRY
    ? "next"
    : "her";

/**
 * Taking a bought-in animal in: where it came from, what it cost, what it weighed, and the
 * window it is being fed for.
 *
 * Almost everything has a default the farm already knows — the Target Window is the next
 * Eid-ul-Adha, the target weight is the Farm Parameter — so the Manager standing by a lorry
 * types the four things only they can know.
 *
 * The page is the form, since taking an animal in is the only thing anybody comes here to do: its four parts one
 * under the other, what will be written read back beside them — with the farm's own answers filled in for what was
 * left blank — and the newest arrivals beneath, so a beast is not written up twice.
 */
const isIntakeDraft = (value: unknown): value is IntakeFields =>
  matchesFormFields(value, EMPTY) &&
  ["male", "female"].includes(value.sex) &&
  ["cash", "bank", "mobile_money"].includes(value.paymentMethod);

const IntakePage = () => {
  const t = useT();
  const refused = useRefused();
  const navigate = useNavigate();
  const me = useQuery(orpc.people.me.queryOptions());
  const draft = useFormDraft(
    draftKeyFor(me.data, "intake"),
    EMPTY,
    isIntakeDraft
  );
  const [photo, setPhoto] = useState<File | null>(null);
  const [writingTrip, setWritingTrip] = useState(false);
  const lorry = useTheLorry(draft);
  const { fields, setFields, startedFrom, offThisLorry } = lorry;
  /** Done with this lorry: the form as blank as it began, and nothing kept for a next beast. */
  const doneWithTheLorry = () => {
    lorry.done();
    setPhoto(null);
  };
  const sheds = useQuery(orpc.sheds.list.queryOptions());
  // The outings the farm has written up lately, so an arrival can be put on the one it came home on.
  const trips = useQuery(orpc.buyingTrips.list.queryOptions());
  // The Ventures that may take an animal in. Only the Owner may read them, so a Manager recording an
  // Intake is simply not asked whose she is — which is right: buying for a Venture is the Owner's call.
  // Whose she is: the Ventures that are buying, which the Manager may read by name because she is the
  // one at the livestock market writing the arrival down.
  const ventures = useQuery(orpc.ventures.takingAnimals.queryOptions());
  const isOwner = useIsOwner();
  // A bought animal comes in only through a quarantine pen. An answer kept from before pens were marked offers none,
  // and says so, until it is read again.
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens
      .filter((pen) => pen.quarantine === true)
      .map((pen) => ({ id: pen.id, name: `${shed.name} / ${pen.name}` }))
  );
  const noQuarantinePen = sheds.data !== undefined && pens.length === 0;

  const record = useMutation(
    orpc.intakes.record.mutationOptions({
      onSuccess: async (taken) => {
        toast.success(t("intake.recorded", { tag: taken.tagNumber }));
        // After the animal exists, because a photo belongs to an animal and there was none
        // until a moment ago. A photo that fails to go up does not undo the arrival: the
        // animal is on the farm either way, and its page will ask for one.
        if (photo) {
          try {
            // Shrunk on the phone, with a thumbnail for the herd's lists: the camera's file would go up whole. The
            // signal at a lorry comes and goes; a photo it drops is kept on the phone and goes when it is back.
            await sendOrKeepAnimalPhoto(
              {
                tagNumber: taken.tagNumber,
                ...(await shrinkAnimalPhoto(photo)),
              },
              (herPhoto) => client.animals.setPhoto(herPhoto)
            );
          } catch {
            toast.error(t("intake.photoLater"));
          }
        }
        // She is on the farm: whatever comes next, the form's draft is spent — here, where it is done even when the
        // page was left while her photo went up, so she is never taken in twice from a draft that outlived her.
        draft.clear();
        setPhoto(null);
      },
      onError: refused,
    })
  );

  const edit = (patch: Partial<IntakeFields>) =>
    setFields({ ...fields, ...patch });
  /** Once she is on the farm, and her photo gone up or kept: her page, or the form again for the next beast off the
   *  same lorry, keeping what is the lorry's — from the form as it was sent, which nobody could change while it went. */
  const afterTaking = (
    tagNumber: string,
    then: "her" | "next",
    sent: IntakeFields
  ) => {
    if (then === "next") {
      lorry.next(sent, tagNumber);
      return;
    }
    navigate({ to: "/animals/$tagNumber", params: { tagNumber } });
  };
  const venture = owningVenture(fields, trips.data ?? [], ventures.data ?? []);
  // A Venture's animal is sold in the Venture's window, so days typed before she was named its are not sent. They are
  // kept in the form, for the moment somebody names her the Farm's again.
  // And one bought with no outing is paid from its account by bank, whatever the box last said.
  const sheet = {
    ...fields,
    ...(venture ? { targetWindowStart: "", targetWindowEnd: "" } : {}),
    ...(boughtFromTheAccount(fields) ? { paymentMethod: "bank" as const } : {}),
  };
  const ready = missingFrom(sheet).length === 0 && windowIsWhole(sheet);
  // The photograph goes up, or onto the phone, after the animal exists — inside the arrival's own success — so the
  // whole arrival is pending until it has.
  const pending = record.isPending;
  const changed = photo !== null || typedSince(fields, startedFrom);

  return (
    <Page>
      <PageHeader description={t("intake.subtitle")} title={t("nav.intake")} />
      <FormDraftNotice
        restored={draft.restored}
        failed={draft.failed}
        onDiscard={doneWithTheLorry}
      />
      {offThisLorry.length > 0 ? (
        <Notice
          action={
            <Button onClick={doneWithTheLorry} size="sm" variant="outline">
              {t("intake.doneWithTheLorry")}
            </Button>
          }
          title={t("intake.offThisLorry")}
          tone="success"
        >
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {offThisLorry.map((tagNumber) => (
              <Link
                className="font-mono underline"
                key={tagNumber}
                params={{ tagNumber }}
                to="/animals/$tagNumber"
              >
                {tagNumber}
              </Link>
            ))}
          </span>
        </Notice>
      ) : null}
      {changed && !pending ? <UnsavedChangesGuard /> : null}

      <form
        className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) {
            return;
          }
          const then = whatComesAfter(event.nativeEvent as SubmitEvent);
          record.mutate(
            intakeSent(fields, sheet),
            // After the arrival's own success, photo and all: her page, or the next off the lorry.
            { onSuccess: (taken) => afterTaking(taken.tagNumber, then, fields) }
          );
        }}
      >
        {/* Locked while she goes up, photo and all: what is kept for the next beast is what was sent, and a photo
            taken meanwhile would be lost with hers. */}
        <fieldset className="contents" disabled={pending}>
          <div className="flex min-w-0 flex-col gap-4">
            {noQuarantinePen ? (
              <Notice
                action={
                  <Link className="underline" to="/sheds">
                    {t("intake.markAQuarantinePen")}
                  </Link>
                }
                title={t("intake.noQuarantinePen")}
                tone="warning"
              />
            ) : null}
            <AnimalSection
              fields={fields}
              onEdit={edit}
              onPhoto={setPhoto}
              pens={pens}
              photoName={photo?.name ?? null}
            />
            <SellerSection fields={fields} onEdit={edit} />
            <PriceSection
              fields={fields}
              onEdit={edit}
              trips={trips.data ?? []}
              onNewTrip={() => setWritingTrip(true)}
              ventures={(ventures.data ?? []).filter(
                (one) => one.state === "buying"
              )}
              isOwner={isOwner}
            />
            <TargetSection fields={fields} onEdit={edit} venture={venture} />
          </div>
        </fieldset>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:row-span-2">
          <IntakeSummary
            fields={sheet}
            pending={pending}
            pens={pens}
            photoName={photo?.name ?? null}
            venture={venture}
          />
        </aside>

        <SubmitBar>
          <TakeInButtons compact pending={pending} ready={ready} />
        </SubmitBar>
      </form>

      {/* Outside the intake's own form: a sheet is drawn elsewhere on the page, but React still carries its submit up
          to the form it sits in, which would take the animal in along with the outing. */}
      <BuyingTripSheet
        onOpenChange={setWritingTrip}
        onRecorded={(buyingTripId) => edit({ buyingTripId })}
        open={writingTrip}
      />

      <RecentIntakes />
      <PastOutings />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/intakes")({
  /** For those who run the farm: the Owner and the Farm Managers. */
  beforeLoad: onlyFor("runsTheFarm"),
  component: IntakePage,
});
