import type { PayInNoteState, PayInWay } from "@OpenFarm/domain";
import { PAY_IN_LINE_MOST, PAY_IN_ANCHOR } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { Banknote, Image, SearchX } from "lucide-react";
import { useEffect, useState } from "react";

import { SaidDate } from "@/components/list-cells";
import { useIsOwner } from "@/components/money";
import type { Tone } from "@/components/page";
import { Notice, Section, StatusBadge } from "@/components/page";
import { FormDialog, FormField } from "@/components/page-kit";
import { TakeCapitalSheet } from "@/components/ventures/take-capital-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { takesCapitalNow } from "@/lib/ventures";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

// The Investors' Pay-in Notes on one Venture (ADR 0018), the Owner's to check against the Venture Account: each one
// recorded from — the capital sheet opened with what it says — or answered not found, with a line the Investor reads.

type Note = Awaited<
  ReturnType<typeof orpc.ventures.payInNotes.list.call>
>[number];

const STATE_TONE: Record<PayInNoteState, Tone> = {
  waiting: "warning",
  received: "success",
  not_found: "neutral",
  withdrawn: "neutral",
  closed: "neutral",
};

const WAY_WORDS = {
  bank_transfer: "ventures.payIn.way.bank_transfer",
  cheque: "ventures.payIn.way.cheque",
  deposit_slip: "ventures.payIn.way.deposit_slip",
  mobile_money: "ventures.payIn.way.mobile_money",
} as const satisfies Record<PayInWay, MessageKey>;

/** The note's line for the Investor, when the Venture Account does not show the money. */
const NotFoundDialog = ({
  note,
  onClose,
}: {
  note: Note | null;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [line, setLine] = useState("");
  const answer = useMutation(
    orpc.ventures.payInNotes.notFound.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("ventures.payIn.answered"));
        setLine("");
        onClose();
      },
    })
  );
  return (
    <FormDialog
      description={t("ventures.payIn.notFoundHint")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onSubmit={() => {
        if (note) {
          answer.mutate({ noteId: note.id, line: line.trim() });
        }
      }}
      open={note !== null}
      pending={answer.isPending}
      ready={line.trim() !== ""}
      submitLabel={t("ventures.payIn.notFound")}
      title={t("ventures.payIn.notFoundTitle")}
    >
      <FormField id="pay-in-line" label={t("ventures.payIn.line")}>
        <Textarea
          id="pay-in-line"
          maxLength={PAY_IN_LINE_MOST}
          onChange={(event) => setLine(event.target.value)}
          placeholder={t("ventures.payIn.linePlaceholder")}
          required
          rows={3}
          value={line}
        />
      </FormField>
    </FormDialog>
  );
};

/** The slip or the screenshot an Investor sent, to read beside the statement. Asked for only when opened. */
const PhotoDialog = ({
  note,
  onClose,
}: {
  note: Note | null;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const photo = useQuery({
    ...orpc.ventures.payInNotes.photo.queryOptions({
      input: { noteId: note?.id ?? "" },
    }),
    enabled: note !== null,
  });
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={note !== null}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        closeLabel={t("common.close")}
      >
        <DialogHeader>
          <DialogTitle>
            {t("ventures.payIn.photoTitle", { investor: note?.investor ?? "" })}
          </DialogTitle>
        </DialogHeader>
        {photo.data ? (
          <img
            alt={t("ventures.payIn.photoTitle", {
              investor: note?.investor ?? "",
            })}
            className="bg-muted/40 w-full rounded-lg border object-contain"
            src={`data:${photo.data.contentType};base64,${photo.data.data}`}
          />
        ) : (
          <Skeleton className="h-64 rounded-lg" />
        )}
      </DialogContent>
    </Dialog>
  );
};

/** One note: whose, how much and how, the day, its reference and the paper's Pay-in Code — and, while it waits, the
 *  Owner's two answers. */
const NoteRow = ({
  note,
  mayRecord,
  onRecord,
  onNotFound,
  onPhoto,
}: {
  note: Note;
  mayRecord: boolean;
  onRecord: () => void;
  onNotFound: () => void;
  onPhoto: () => void;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const waiting = note.state === "waiting";
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={waiting ? "font-medium" : undefined}>
            {t("ventures.payIn.said", {
              investor: note.investor,
              amount: asMoney(note.amountMoney),
              way: t(WAY_WORDS[note.way]),
            })}
          </span>
          <StatusBadge tone={STATE_TONE[note.state]}>
            {t(`ventures.payIn.state.${note.state}`)}
          </StatusBadge>
        </span>
        <span className="text-muted-foreground flex flex-wrap gap-x-1.5 text-xs">
          <span>
            {t("ventures.payIn.sentOn")} <SaidDate at={note.sentOn} />
          </span>
          <span>·</span>
          <span className="break-all">
            {t("ventures.payIn.facts", {
              reference: note.reference,
              code: note.payInCode,
            })}
          </span>
        </span>
        {note.answerLine ? (
          <span className="text-sm italic">{note.answerLine}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {note.hasPhoto ? (
          <Button onClick={onPhoto} size="sm" type="button" variant="ghost">
            <Image aria-hidden data-icon="inline-start" />
            {t("ventures.payIn.photo")}
          </Button>
        ) : null}
        {waiting ? (
          <>
            <Button
              onClick={onNotFound}
              size="sm"
              type="button"
              variant="outline"
            >
              <SearchX aria-hidden data-icon="inline-start" />
              {t("ventures.payIn.notFound")}
            </Button>
            {mayRecord ? (
              <Button onClick={onRecord} size="sm" type="button">
                <Banknote aria-hidden data-icon="inline-start" />
                {t("ventures.payIn.record")}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
};

/**
 * The Pay-in Notes on a Venture, the waiting ones first: what Investors say they sent, for the Owner to find in the
 * Venture Account and record, or answer not found (ADR 0018). The Owner's alone, as every Investor's money is; nothing
 * on a Venture nobody has sent a note on.
 */
export const VenturePayInNotes = ({ venture }: { venture: Venture }) => {
  const owner = useIsOwner();
  const { t } = useLanguage();
  const read = useQuery({
    ...orpc.ventures.payInNotes.list.queryOptions({
      input: { ventureId: venture.id },
    }),
    enabled: owner,
  });
  const hash = useLocation({ select: (location) => location.hash });
  const [recording, setRecording] = useState<Note | null>(null);
  const [notFound, setNotFound] = useState<Note | null>(null);
  const [looking, setLooking] = useState<Note | null>(null);
  const loaded = !read.isPending;
  // The Owner's Notice of a note leads here by the address; the section is drawn only once the notes have come.
  useEffect(() => {
    if (loaded && hash === PAY_IN_ANCHOR) {
      document
        .querySelector(`#${PAY_IN_ANCHOR}`)
        ?.scrollIntoView({ block: "start" });
    }
  }, [loaded, hash]);
  if (!owner) {
    return null;
  }
  if (read.isPending) {
    return <Skeleton className="h-24 rounded-xl" />;
  }
  const notes = read.data ?? [];
  if (notes.length === 0) {
    return null;
  }
  // Waiting first, then the rest as they came: what is still to check leads.
  const ordered = [
    ...notes.filter((one) => one.state === "waiting"),
    ...notes.filter((one) => one.state !== "waiting"),
  ];
  const taking = takesCapitalNow(venture);
  return (
    <div className="scroll-mt-6" id={PAY_IN_ANCHOR}>
      <Section
        description={t("ventures.payIn.hint")}
        title={t("ventures.payIn.title")}
      >
        <ul className="divide-y">
          {ordered.map((note) => (
            <NoteRow
              key={note.id}
              mayRecord={taking}
              note={note}
              onNotFound={() => setNotFound(note)}
              onPhoto={() => setLooking(note)}
              onRecord={() => setRecording(note)}
            />
          ))}
        </ul>
      </Section>
      <TakeCapitalSheet
        fromNote={
          recording
            ? {
                id: recording.id,
                investor: recording.investor,
                agreementId: recording.agreementId,
                amountMoney: recording.amountMoney,
                sentOn: recording.sentOn,
                reference: recording.reference,
              }
            : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setRecording(null);
          }
        }}
        open={recording !== null}
        venture={venture}
      />
      <NotFoundDialog note={notFound} onClose={() => setNotFound(null)} />
      <PhotoDialog note={looking} onClose={() => setLooking(null)} />
    </div>
  );
};

/**
 * Every Venture with Pay-in Notes still to check, in one notice where the Owner keeps her Investors — each Venture a
 * link to its notes. Nothing while none wait.
 */
export const NotesWaitingNotice = () => {
  const { t } = useLanguage();
  const ventures = useQuery(orpc.ventures.list.queryOptions());
  // Missing from a list this phone kept from before notes were counted: none.
  const waiting = (ventures.data ?? []).filter(
    (one) => (one.payInNotesWaiting ?? 0) > 0
  );
  const total = waiting.reduce(
    (sum, one) => sum + (one.payInNotesWaiting ?? 0),
    0
  );
  if (total === 0) {
    return null;
  }
  return (
    <Notice
      icon={Banknote}
      title={t("ventures.payIn.waitingTitle", { count: total })}
      tone="info"
    >
      <ul className="flex flex-col gap-0.5">
        {waiting.map((one) => (
          <li key={one.id}>
            <Link
              className="underline-offset-4 hover:underline"
              hash={PAY_IN_ANCHOR}
              params={{ ventureId: one.id }}
              to="/ventures/$ventureId/investors"
            >
              {t("ventures.payIn.waitingOn", {
                venture: one.name,
                count: one.payInNotesWaiting ?? 0,
              })}
            </Link>
          </li>
        ))}
      </ul>
    </Notice>
  );
};
