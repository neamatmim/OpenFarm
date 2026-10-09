import type { PayInNoteState, PayInWay } from "@OpenFarm/domain";
import {
  PAY_IN_REFERENCE_MOST,
  PAY_IN_WAYS,
  farmDayOf,
} from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { PenLine, Send, Undo2 } from "lucide-react";
import { useState } from "react";

import { SaidDate } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import { Section, StatusBadge } from "@/components/page";
import {
  ConfirmDialog,
  FormField,
  FormSheet,
  InsetPanel,
  NativeSelect,
} from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import { WhyNot, useCanAct } from "@/components/portal/portal-source";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import { useMoney } from "@/lib/money";
import type { Photo } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

// A Pay-in Note (ADR 0018), as the Investor sees it: on their own Venture's page, under how to pay, a way to tell the
// farm they have sent money, and each note they sent with where it stands. Nothing is paid here — the money goes to
// the Venture Account by bank or bKash, and the farm records it.

type Today = Awaited<ReturnType<typeof orpc.portal.venture.call>>;
type PayIn = Today["payIn"];
type TheirNote = PayIn["notes"][number];
type Paying = NonNullable<Today["howToPay"]>;

/** Why the farm would not take a note, said to the Investor. */
const REFUSALS = {
  pay_in_notes_off: "portal.payIn.refused.pay_in_notes_off",
  pay_in_day_ahead: "portal.payIn.refused.pay_in_day_ahead",
  pay_in_over_owed: "portal.payIn.refused.pay_in_over_owed",
  agreement_has_no_paper: "portal.payIn.refused.agreement_has_no_paper",
  venture_takes_no_capital: "portal.payIn.refused.venture_takes_no_capital",
  venture_has_no_account: "portal.payIn.refused.venture_has_no_account",
  investor_retired: "portal.payIn.refused.investor_retired",
  no_such_agreement: "portal.payIn.refused.no_such_agreement",
  no_such_pay_in_note: "portal.payIn.refused.no_such_pay_in_note",
  pay_in_note_not_waiting: "portal.payIn.refused.pay_in_note_not_waiting",
} as const satisfies Record<string, MessageKey>;

const STATE_TONE: Record<PayInNoteState, Tone> = {
  waiting: "info",
  received: "success",
  not_found: "warning",
  withdrawn: "neutral",
  closed: "neutral",
};

/** A note's own words for how the money went, and what its reference is called. */
const WAY_WORDS = {
  bank_transfer: {
    way: "portal.payIn.way.bank_transfer",
    reference: "portal.payIn.reference.bank_transfer",
  },
  check: {
    way: "portal.payIn.way.check",
    reference: "portal.payIn.reference.check",
  },
  deposit_slip: {
    way: "portal.payIn.way.deposit_slip",
    reference: "portal.payIn.reference.deposit_slip",
  },
  mobile_money: {
    way: "portal.payIn.way.mobile_money",
    reference: "portal.payIn.reference.mobile_money",
  },
} as const satisfies Record<
  PayInWay,
  { way: MessageKey; reference: MessageKey }
>;

/** What the money they still owe is in their Pay-in Notes still waiting: said under how to pay, so the figure does
 *  not read as ignored. */
export const waitingMoneyOf = (payIn: PayIn | undefined): number =>
  (payIn?.notes ?? [])
    .filter((one) => one.state === "waiting")
    .reduce((sum, one) => sum + one.amountMoney, 0);

/** What a note says, typed: the amount as text until it is sent. */
interface Saying {
  amountMoney: string;
  sentOn: string;
  way: PayInWay;
  reference: string;
}

/**
 * Telling the farm they sent money, or changing a note that waits: how much, the day, the way, the reference, and a
 * photo of the slip if they have one. Above it, the Pay-in Code that should be on the transfer.
 */
const NoteSheet = ({
  agreementId,
  paying,
  roomMoney,
  changing,
  open,
  onOpenChange,
}: {
  agreementId: string;
  paying: Paying;
  /** What a new note may still tell of, the notes waiting counted; an answer kept from before says none. */
  roomMoney: number | undefined;
  /** The note being changed; none for a new one. */
  changing: TheirNote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const acting = useCanAct();
  const refused = useRefused(REFUSALS);
  // What is due now leads where it is paid by the month; what is owed otherwise — never more than the notes already
  // waiting leave room for, which the farm would refuse.
  const owing = paying.monthly?.dueMoney || paying.owedMoney;
  const due = Math.min(owing, roomMoney ?? owing);
  const fresh = (): Saying =>
    changing
      ? {
          amountMoney: String(changing.amountMoney),
          sentOn: changing.sentOn,
          way: changing.way,
          reference: changing.reference,
        }
      : {
          amountMoney: String(due),
          sentOn: farmDayOf(new Date()),
          way: "bank_transfer",
          reference: "",
        };
  const [said, setSaid] = useState<Saying>(fresh);
  const [photo, setPhoto] = useState<Photo | null>(null);
  // A new note, or another note to change: what was typed for one is not the other's.
  useFreshFor(open ? (changing?.id ?? "new") : undefined, () => {
    setSaid(fresh());
    setPhoto(null);
  });
  const done = () => {
    setSaid(fresh());
    setPhoto(null);
    onOpenChange(false);
  };
  const send = useMutation(
    orpc.portal.sendPayInNote.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("portal.payIn.sent"));
        done();
      },
    })
  );
  const change = useMutation(
    orpc.portal.changePayInNote.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("portal.payIn.changed"));
        done();
      },
    })
  );
  const amount = Number(said.amountMoney);
  const ready =
    acting.can &&
    amount > 0 &&
    said.sentOn !== "" &&
    said.reference.trim() !== "";
  const body = {
    amountMoney: amount,
    sentOn: said.sentOn,
    way: said.way,
    reference: said.reference.trim(),
  };
  return (
    <FormSheet
      description={t("portal.payIn.sheetHint", { code: paying.payInCode })}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (!acting.can) {
          return;
        }
        if (changing) {
          // A photo taken now replaces the one kept; none taken leaves it as it was.
          change.mutate({
            noteId: changing.id,
            ...body,
            ...(photo ? { photo } : {}),
          });
          return;
        }
        send.mutate({ agreementId, ...body, photo });
      }}
      open={open}
      pending={send.isPending || change.isPending}
      ready={ready}
      submitLabel={
        changing ? t("portal.payIn.saveChange") : t("portal.payIn.send")
      }
      title={t("portal.payIn.sheetTitle")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="pay-in-amount" label={t("portal.payIn.amount")}>
          <Input
            id="pay-in-amount"
            onChange={(event) =>
              setSaid({ ...said, amountMoney: event.target.value })
            }
            required
            type="number"
            value={said.amountMoney}
          />
        </FormField>
        <FormField id="pay-in-day" label={t("portal.payIn.sentOn")}>
          <Input
            id="pay-in-day"
            max={farmDayOf(new Date())}
            onChange={(event) =>
              setSaid({ ...said, sentOn: event.target.value })
            }
            required
            type="date"
            value={said.sentOn}
          />
        </FormField>
      </div>
      <FormField id="pay-in-way" label={t("portal.payIn.way")}>
        <NativeSelect
          id="pay-in-way"
          onChange={(event) =>
            setSaid({ ...said, way: event.target.value as PayInWay })
          }
          value={said.way}
        >
          {PAY_IN_WAYS.map((way) => (
            <option key={way} value={way}>
              {t(WAY_WORDS[way].way)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField
        hint={t("portal.payIn.referenceHint")}
        id="pay-in-reference"
        label={t(WAY_WORDS[said.way].reference)}
      >
        <Input
          autoComplete="off"
          id="pay-in-reference"
          maxLength={PAY_IN_REFERENCE_MOST}
          onChange={(event) =>
            setSaid({ ...said, reference: event.target.value })
          }
          required
          value={said.reference}
        />
      </FormField>
      <FormField id="pay-in-photo" label={t("portal.payIn.photo")}>
        <PhotoField
          chosen={photo !== null || (changing?.hasPhoto ?? false)}
          fromCamera={false}
          id="pay-in-photo"
          onPhoto={setPhoto}
          takeLabel="portal.payIn.takePhoto"
        />
      </FormField>
      <WhyNot acting={acting} />
    </FormSheet>
  );
};

/** What became of a note, in a line under it: what the farm will do, did, or said. */
const WhatBecameOfIt = ({ note }: { note: TheirNote }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  // The capital the farm recorded from it, where that was not the sum they said: theirs is what was recorded.
  const recordedOther =
    note.receivedMoney !== null &&
    note.receivedMoney !== undefined &&
    note.receivedMoney !== note.amountMoney
      ? note.receivedMoney
      : null;
  if (note.state === "waiting") {
    return (
      <p className="text-muted-foreground text-sm">
        {t("portal.payIn.waitingSay")}
      </p>
    );
  }
  if (note.state === "received") {
    return (
      <p className="text-sm">
        {recordedOther === null
          ? t("portal.payIn.receivedSay")
          : t("portal.payIn.receivedSayAmount", {
              amount: asMoney(recordedOther),
            })}
      </p>
    );
  }
  if (note.state === "not_found") {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p>{t("portal.payIn.notFoundSay")}</p>
        {note.answerLine ? (
          <blockquote className="border-warning/50 border-l-2 ps-3 italic">
            {note.answerLine}
          </blockquote>
        ) : null}
      </div>
    );
  }
  if (note.state === "closed" && note.closedBecause) {
    return (
      <p className="text-muted-foreground text-sm">
        {t(`portal.payIn.closed.${note.closedBecause}`)}
      </p>
    );
  }
  return null;
};

/** One note they sent: how much, how and when, its reference, where it stands — and, while it waits, change or
 *  withdraw. */
const NoteCard = ({
  note,
  mayChange,
  onChange,
}: {
  note: TheirNote;
  /** Whether the farm still takes a change to it: not once the switch is off or nothing is owed. */
  mayChange: boolean;
  onChange: (note: TheirNote) => void;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const acting = useCanAct();
  const refused = useRefused(REFUSALS);
  const [asking, setAsking] = useState(false);
  const withdraw = useMutation(
    orpc.portal.withdrawPayInNote.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setAsking(false);
        toast.success(t("portal.payIn.withdrawn"));
      },
    })
  );
  const waiting = note.state === "waiting";
  return (
    <InsetPanel as="li" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium tabular-nums">
          {t("portal.payIn.said", {
            amount: asMoney(note.amountMoney),
            way: t(WAY_WORDS[note.way].way),
          })}
        </span>
        <StatusBadge tone={STATE_TONE[note.state]}>
          {t(`portal.payIn.state.${note.state}`)}
        </StatusBadge>
      </div>
      <p className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
        <SaidDate at={note.sentOn} />
        <span>·</span>
        <span className="break-all">
          {t("portal.payIn.reference", { reference: note.reference })}
        </span>
        {note.hasPhoto ? (
          <>
            <span>·</span>
            <span>{t("portal.payIn.withPhoto")}</span>
          </>
        ) : null}
      </p>
      <WhatBecameOfIt note={note} />
      {waiting ? (
        <div className="flex flex-wrap gap-2">
          {mayChange ? (
            <Button
              disabled={!acting.can}
              onClick={() => onChange(note)}
              size="sm"
              type="button"
              variant="outline"
            >
              <PenLine aria-hidden data-icon="inline-start" />
              {t("portal.payIn.change")}
            </Button>
          ) : null}
          <Button
            disabled={!acting.can || withdraw.isPending}
            onClick={() => setAsking(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Undo2 aria-hidden data-icon="inline-start" />
            {t("portal.payIn.withdraw")}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        confirmLabel={t("portal.payIn.withdraw")}
        description={t("portal.payIn.withdrawWhy")}
        onConfirm={() => withdraw.mutate({ noteId: note.id })}
        onOpenChange={setAsking}
        open={asking}
        pending={withdraw.isPending}
        title={t("portal.payIn.withdrawTitle")}
      />
    </InsetPanel>
  );
};

/**
 * The money they have told the farm they sent towards this Agreement, and a way to tell it more while anything is
 * owed and the farm takes these notes (ADR 0018). Nothing when there is neither: no notes, and nothing to tell.
 */
export const PayInNotes = ({
  agreementId,
  payIn,
  paying,
}: {
  agreementId: string;
  /** Missing from an answer this phone kept from before the portal took these notes. */
  payIn: PayIn | undefined;
  paying: Paying | null;
}) => {
  const { t } = useLanguage();
  const acting = useCanAct();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState<TheirNote | null>(null);
  const notes = payIn?.notes ?? [];
  const mayTell = (payIn?.mayTell ?? false) && paying !== null;
  // An answer kept from before the farm said so reads as it did then: a waiting note changed wherever one is paying.
  const mayChange = (payIn?.mayChange ?? true) && paying !== null;
  if (notes.length === 0 && !mayTell) {
    return null;
  }
  return (
    <Section
      action={
        mayTell ? (
          <Button
            disabled={!acting.can}
            onClick={() => {
              setChanging(null);
              setOpen(true);
            }}
            size="sm"
            type="button"
          >
            <Send aria-hidden data-icon="inline-start" />
            {t("portal.payIn.tell")}
          </Button>
        ) : null
      }
      description={t("portal.payIn.hint")}
      title={t("portal.payIn.title")}
    >
      <div className="flex flex-col gap-3">
        <WhyNot acting={acting} />
        {notes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                mayChange={mayChange}
                note={note}
                onChange={(one) => {
                  setChanging(one);
                  setOpen(true);
                }}
              />
            ))}
          </ul>
        ) : null}
      </div>
      {paying ? (
        <NoteSheet
          agreementId={agreementId}
          changing={changing}
          onOpenChange={(wanted) => {
            setOpen(wanted);
            if (!wanted) {
              setChanging(null);
            }
          }}
          open={open}
          paying={paying}
          roomMoney={payIn?.roomMoney}
        />
      ) : null}
    </Section>
  );
};
