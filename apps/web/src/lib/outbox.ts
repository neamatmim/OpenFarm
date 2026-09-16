import type { EntryRefusal } from "@OpenFarm/api/entries/entry";
import type { EntryInput, EntryResult } from "@OpenFarm/api/sync-entries";
import type {
  LeaderElection,
  OnlineDetector,
  RetryPolicy,
  StorageAdapter,
} from "@tanstack/offline-transactions";

/** The kinds of Entry a phone can hold (ADR 0004). */
export type EntryKindName = EntryInput["kind"];

/** What an Entry of one kind says, in the farm's own shape for it — everything but what the Outbox adds to every entry. */
export type EntryBody<K extends EntryKindName> = Omit<
  Extract<EntryInput, { kind: K }>,
  "id" | "seq" | "kind" | "recordedAt" | "actorId" | "switchToken"
>;

/** A kind of Entry with the body that belongs to it. */
type EntryDraft = {
  [K in EntryKindName]: { kind: K; body: EntryBody<K> };
}[EntryKindName];

/** One thing a phone recorded, waiting to be told to the farm. The shape the batch
 *  procedure takes, plus what the outbox needs to send it in order. */
export type OutboxEntry = {
  [K in EntryKindName]: {
    /** The client's own id for the record. The same entry sent twice is one fact. */
    id: string;
    /** Where this sits in the phone's own count, so the farm can see what it never read. */
    seq: number;
    kind: K;
    /** The entry as the batch procedure wants it, minus the fields above. */
    body: EntryBody<K>;
    /** The phone's clock, at the moment the person recorded it. */
    recordedAt: string;
    /** Who recorded it: on a Shed Phone, whoever was PIN-switched in at that moment. */
    actorId?: string;
    /** Their proof of it: the switch token, or the reference of a PIN still to be proved. */
    proof?: string;
  };
}[EntryKindName];

/** An entry as it goes on the wire: the farm's own shape, the proof of who recorded it already turned into the
 *  switch token that proves it. */
export type OutgoingEntry = EntryInput;

/** What a proof of who recorded an entry is worth when a Batch is frozen: the switch token the farm gave for that
 *  stint, a PIN the farm refused, or a PIN a tab on this phone still holds and has yet to prove. */
export type ProofSettled = { token: string } | "refused" | "waiting";

/** An entry the phone is still holding, and what the farm said about it. */
export interface Held {
  entry: OutboxEntry;
  /** For whoever reads a log. */
  reason: string;
  /** Why, in words the screen can put into the reader's language: missing on a batch refused whole. */
  refusal?: EntryRefusal;
}

/** What the farm said about one entry. */
export type EntryVerdict = Pick<
  EntryResult,
  "id" | "seq" | "outcome" | "reason" | "refusal"
>;

/** A send in flight: the entries, and the one key they go under. The key is made before the
 *  first attempt and kept for every retry, so a reply lost on the way back cannot become a
 *  second set of records (ADR 0002). */
interface PendingBatch {
  key: string;
  entryIds: string[];
  /** The entries as they will be sent, frozen when the Batch was formed: every attempt under this key carries
   *  these, whatever the phone has learned since (the glossary's Batch). */
  entries: OutgoingEntry[];
  retryCount: number;
  nextAttemptAt: number;
  lastError?: string;
  /** What the farm said, written down before a single entry is acted on. A phone that dies
   *  midway through clearing its queue comes back and finishes the job — rather than
   *  offering the same key a shorter batch, which the farm rightly refuses. */
  verdicts?: EntryVerdict[];
}

export interface Transport {
  send: (batch: {
    key: string;
    /** This phone's clock, now. Not what the entries say — those are honestly old — but
     *  what the phone believes the time to be as it speaks. */
    sentAt: string;
    entries: OutgoingEntry[];
  }) => Promise<{ results: EntryVerdict[] }>;
}

/** Why the outbox has stopped sending. */
export type OutboxPause = "none" | "signed_out";

export interface OutboxState {
  /** Entries recorded and not yet in the farm's records. */
  pending: number;
  /** Entries the farm sent back. They keep their data so someone can re-enter them. */
  rejected: number;
  /** Entries the farm took but put in front of a person. */
  reviewed: number;
  /** When the farm last took something from this phone. */
  lastSyncAt: string | null;
  paused: OutboxPause;
}

/** The largest batch one send carries; the server refuses more. */
const BATCH_MAX = 200;
/** And the most it may weigh. A shed photo is a megabyte or so of base64, and two hundred of
 *  them would be a request no phone on a weak signal will ever finish. What does not fit
 *  goes in the next batch. */
const BATCH_MAX_BYTES = 4_000_000;
const ENTRY = "entry:";
const REJECTED = "rejected:";
const NEEDS_REVIEW = "needs-review:";
const PENDING_BATCH = "batch:pending";
const NEXT_SEQ = "meta:seq";
const LAST_SYNC = "meta:lastSync";
const PAUSED = "meta:paused";
/** Sequence numbers are padded so the storage adapter's key order is the order the work
 *  happened: a phone sends what it recorded first, first. */
const SEQ_WIDTH = 12;

/** Ordered by sequence, but ending in the entry's own id, so two entries that somehow take
 *  the same number sit beside each other rather than one quietly replacing the other. */
const entryKey = (seq: number, id: string) =>
  `${ENTRY}${String(seq).padStart(SEQ_WIDTH, "0")}:${id}`;

/** An entry as the farm reads it: its body, with what the Outbox knows about it beside, and the switch token its
 *  proof was worth when the Batch was frozen. The body was checked against its kind when it was added, and
 *  flattening changes nothing about that — TypeScript only cannot follow the kind through the spread. */
const outgoing = (
  { body, kind, id, seq, recordedAt, actorId }: OutboxEntry,
  switchToken: string | undefined
) =>
  ({
    ...body,
    id,
    seq,
    kind,
    recordedAt,
    ...(actorId ? { actorId } : {}),
    ...(switchToken ? { switchToken } : {}),
  }) as OutgoingEntry;

/** Where an entry the farm did not simply take is kept. */
const HELD_UNDER: Partial<Record<EntryVerdict["outcome"], string>> = {
  rejected: REJECTED,
  kept: NEEDS_REVIEW,
};

/** As much of the queue as one send should carry: bounded by count and by weight, and never
 *  fewer than one, because a single entry too heavy for the budget still has to go. */
const takeWhatFits = (waiting: OutboxEntry[]): OutboxEntry[] => {
  const taken: OutboxEntry[] = [];
  let bytes = 0;
  for (const entry of waiting) {
    const weight = JSON.stringify(entry).length;
    if (
      taken.length > 0 &&
      (taken.length >= BATCH_MAX || bytes + weight > BATCH_MAX_BYTES)
    ) {
      break;
    }
    taken.push(entry);
    bytes += weight;
  }
  return taken;
};

/** The one shape an error has to have for the outbox to know it must stop and ask the
 *  person to sign in again rather than retry for ever. */
const isSignedOut = (error: unknown): boolean => {
  const code = (error as { code?: string; status?: number } | null)?.code;
  const status = (error as { status?: number } | null)?.status;
  return code === "UNAUTHORIZED" || status === 401;
};

/** Codes that mean "not now" rather than "not ever": a farm too busy to answer, a request
 *  that timed out on a weak signal. Offering the same batch again is exactly right. */
const TRY_AGAIN = new Set([408, 425, 429]);

/** An error the farm will never accept, however often it is offered. Everything else — no
 *  route, a gateway, a server that fell over — is worth another go. */
const isRefusal = (error: unknown): boolean => {
  const status = (error as { status?: number } | null)?.status;
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    !TRY_AGAIN.has(status)
  );
};

export interface OutboxOptions {
  storage: StorageAdapter;
  transport: Transport;
  retry: RetryPolicy;
  /** Only one tab sends: two tabs racing would send the same entries twice under two keys. */
  leader?: LeaderElection;
  online?: OnlineDetector;
  now?: () => Date;
  /** The key for a send. Injectable so a test can name them. */
  newKey?: () => string;
  /** Who is working on this phone right now, so each entry carries the person who recorded it. */
  actorOf?: () => string | null;
  /** What proves it was them — on a Shed Phone, the switch token for their stint, or the reference of a PIN still
   *  to be proved. */
  proofOf?: () => string | null;
  /** What each proof in a Batch being frozen is worth: a switch token, a PIN the farm refused, or a PIN a tab on
   *  this phone still holds. Proving held PINs with the farm happens in here, before it answers. Unasked, every
   *  proof is taken as the token it already is. */
  proofs?: (refs: readonly string[]) => Promise<Map<string, ProofSettled>>;
}

/**
 * The durable queue between a phone with no signal and the farm.
 *
 * Everything a person records goes in here before the screen says it is done, and stays
 * until the farm has taken it. Nothing is dropped: an entry the farm refuses keeps its data
 * on the phone so somebody can put it right, and an entry the farm keeps for review is the
 * farm's business from then on.
 */
export class Outbox {
  private readonly options: Required<
    Pick<OutboxOptions, "storage" | "transport" | "retry">
  > &
    OutboxOptions;
  private paused: OutboxPause = "none";
  private flushing = false;
  /** This phone's own count of what it has recorded. */
  private counter: number | null = null;
  private fromDevice: Promise<number | null> | null = null;

  constructor(options: OutboxOptions) {
    this.options = options;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private newKey(): string {
    return (
      this.options.newKey?.() ??
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random()}`
    );
  }

  private async read<T>(key: string): Promise<T | null> {
    const raw = await this.options.storage.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  private write(key: string, value: unknown): Promise<void> {
    return this.options.storage.set(key, JSON.stringify(value));
  }

  /** The next number in this phone's own count. Kept on the device, never reset: a gap in
   *  it is how the farm learns an entry never arrived. */
  private async takeSeq(): Promise<number> {
    // Read from the device once, then counted in memory. Taking a number and putting the
    // next one back are two steps, and two taps in the same instant would otherwise take
    // the same one — the increment below is a single step nothing can get between.
    this.fromDevice ??= this.read<number>(NEXT_SEQ);
    const stored = await this.fromDevice;
    // Checked after the wait, not before it. `??=` tests its target first, so three taps
    // arriving together all passed the test while the number was still unread, and all
    // three took the same one.
    this.counter ??= stored ?? 1;
    const seq = this.counter;
    this.counter += 1;
    await this.write(NEXT_SEQ, this.counter);
    return seq;
  }

  /** Records something, durably, before anything on screen says it happened. */
  async add<K extends EntryKindName>(
    kind: K,
    body: EntryBody<K>,
    id: string
  ): Promise<OutboxEntry>;
  async add(
    kind: EntryKindName,
    body: EntryBody<EntryKindName>,
    id: string
  ): Promise<OutboxEntry> {
    const seq = await this.takeSeq();
    const actorId = this.options.actorOf?.() ?? undefined;
    const proof = this.options.proofOf?.() ?? undefined;
    // The kind and its body arrive paired by `add`'s own signature; TypeScript cannot carry that pairing through a
    // generic into the union, so it is said once, here.
    const recorded = { kind, body } as EntryDraft;
    const entry: OutboxEntry = {
      ...recorded,
      id,
      seq,
      recordedAt: this.now().toISOString(),
      ...(actorId ? { actorId } : {}),
      ...(proof ? { proof } : {}),
    };
    await this.write(entryKey(seq, id), entry);
    return entry;
  }

  /** Everything waiting, oldest first. */
  async pending(): Promise<OutboxEntry[]> {
    const keys = await this.options.storage.keys();
    const waiting = keys.filter((key) => key.startsWith(ENTRY)).toSorted();
    const entries: OutboxEntry[] = [];
    for (const key of waiting) {
      // Sequential on purpose: the adapter is a key-value store, and the order is the point.
      // oxlint-disable-next-line no-await-in-loop
      const entry = await this.read<OutboxEntry>(key);
      if (entry) {
        entries.push(entry);
      }
    }
    return entries;
  }

  private async under(prefix: string): Promise<Held[]> {
    const keys = await this.options.storage.keys();
    const rows: Held[] = [];
    for (const key of keys.filter((one) => one.startsWith(prefix)).toSorted()) {
      // oxlint-disable-next-line no-await-in-loop
      const row = await this.read<Held>(key);
      if (row) {
        rows.push(row);
      }
    }
    return rows;
  }

  /** What the farm sent back, with the data the person entered, so they can put it right. */
  rejected(): Promise<Held[]> {
    return this.under(REJECTED);
  }

  /** What the farm took but put in front of somebody. */
  reviewed(): Promise<Held[]> {
    return this.under(NEEDS_REVIEW);
  }

  /** The person has dealt with a refused or reviewed entry: it leaves the phone. */
  async discard(id: string): Promise<void> {
    await this.options.storage.delete(`${REJECTED}${id}`);
    await this.options.storage.delete(`${NEEDS_REVIEW}${id}`);
  }

  async state(): Promise<OutboxState> {
    const [waiting, refused, looked, lastSyncAt] = await Promise.all([
      this.pending(),
      this.rejected(),
      this.reviewed(),
      this.read<string>(LAST_SYNC),
    ]);
    await this.pausedNow();
    return {
      pending: waiting.length,
      rejected: refused.length,
      reviewed: looked.length,
      lastSyncAt,
      paused: this.paused,
    };
  }

  /** The person has signed in again. */
  async resume(): Promise<void> {
    this.paused = "none";
    await this.options.storage.delete(PAUSED);
  }

  /** Read back at every flush, because a phone that is reloaded has forgotten it stopped. */
  private async pausedNow(): Promise<OutboxPause> {
    if (this.paused !== "none") {
      return this.paused;
    }
    const stored = await this.read<OutboxPause>(PAUSED);
    this.paused = stored ?? "none";
    return this.paused;
  }

  /**
   * Sends what is waiting, oldest first, under one key that is kept across retries.
   *
   * Returns without doing anything when there is nothing to send, when the phone has no
   * signal, when another tab is doing it, or when the outbox is waiting for somebody to
   * sign in again — none of which are failures.
   */
  async flush(): Promise<{ sent: number; verdicts: EntryVerdict[] }> {
    const nothing = { sent: 0, verdicts: [] };
    if (this.flushing || (await this.pausedNow()) !== "none") {
      return nothing;
    }
    if (this.options.online && !this.options.online.isOnline()) {
      return nothing;
    }
    const held = await this.options.leader?.requestLeadership();
    if (this.options.leader && !held) {
      return nothing;
    }
    this.flushing = true;
    try {
      return await this.send();
    } finally {
      this.flushing = false;
      this.options.leader?.releaseLeadership();
    }
  }

  private async send(): Promise<{ sent: number; verdicts: EntryVerdict[] }> {
    const nothing = { sent: 0, verdicts: [] };
    const waiting = await this.pending();
    if (waiting.length === 0) {
      await this.options.storage.delete(PENDING_BATCH);
      return nothing;
    }
    const batch = await this.batchFor(waiting);
    if (!batch) {
      // A tab on this phone still holds a PIN somebody entered offline: the work is theirs, and there is nothing
      // yet to prove it with. Waiting is not a failed attempt (the glossary's Waiting for a PIN) — nothing is
      // sent, nothing is handed back, and the Batch is offered again on the next flush.
      return nothing;
    }
    if (batch.verdicts) {
      // The farm already answered this batch; the phone stopped before it had finished
      // putting the answer away. Finish that, and send nothing.
      await this.finish(batch, waiting);
      return { sent: 0, verdicts: batch.verdicts };
    }
    if (this.now().getTime() < batch.nextAttemptAt) {
      // Still backing off from the last attempt.
      return nothing;
    }
    try {
      const answer = await this.options.transport.send({
        key: batch.key,
        sentAt: this.now().toISOString(),
        // Exactly what was frozen, whatever the phone has learned since: the same key never carries two things.
        entries: batch.entries,
      });
      // Written down first. From here the batch is settled business whatever becomes of the
      // phone; what is left is bookkeeping the next flush can finish.
      const answered = { ...batch, verdicts: answer.results };
      await this.write(PENDING_BATCH, answered);
      await this.finish(answered, waiting);
      return { sent: batch.entries.length, verdicts: answer.results };
    } catch (error) {
      await this.stumble(batch, error);
      return nothing;
    }
  }

  /**
   * The Batch in flight, or a new one frozen over what is waiting — its key, and its entries as they will be sent.
   * The key outlives the attempt and so do the entries under it. Nothing at all while a PIN entered offline is
   * still to be proved.
   */
  private async batchFor(waiting: OutboxEntry[]): Promise<PendingBatch | null> {
    const inFlight = await this.read<PendingBatch>(PENDING_BATCH);
    // A Batch written down before this phone knew how to freeze one is formed afresh, under a new key. Its entries
    // are named by their own ids, and the same entry arriving twice is one fact (ADR 0002), so nothing is applied
    // a second time by it.
    if (inFlight?.entries) {
      const still = new Set(waiting.map((entry) => entry.id));
      if (inFlight.entryIds.some((id) => still.has(id))) {
        return inFlight;
      }
    }
    const taking = takeWhatFits(waiting);
    const settled = await this.settledProofs(taking);
    if (!settled) {
      return null;
    }
    const fresh: PendingBatch = {
      key: this.newKey(),
      entryIds: taking.map((entry) => entry.id),
      entries: taking.map((entry) =>
        outgoing(entry, entry.proof ? settled.get(entry.proof) : undefined)
      ),
      retryCount: 0,
      nextAttemptAt: 0,
    };
    await this.write(PENDING_BATCH, fresh);
    return fresh;
  }

  /**
   * What each entry's proof is worth, for the Batch about to be frozen: the switch token for the stint it was
   * recorded in, or nothing for a PIN the farm refused or one no tab holds any more — an entry then goes unproved,
   * and the farm keeps it for a person like any Entry it cannot take. Nothing at all while a tab still holds a PIN.
   */
  private async settledProofs(
    taking: readonly OutboxEntry[]
  ): Promise<Map<string, string | undefined> | null> {
    const refs = [
      ...new Set(taking.flatMap((entry) => (entry.proof ? [entry.proof] : []))),
    ];
    if (refs.length === 0) {
      return new Map();
    }
    // Unasked, a proof is the switch token it already is: a phone that is nobody's Shed Phone holds no PINs.
    if (!this.options.proofs) {
      return new Map(refs.map((ref) => [ref, ref]));
    }
    const answers = await this.options.proofs(refs);
    if (refs.some((ref) => answers.get(ref) === "waiting")) {
      return null;
    }
    return new Map(
      refs.map((ref) => {
        const answer = answers.get(ref);
        return [
          ref,
          answer && answer !== "refused" && answer !== "waiting"
            ? answer.token
            : undefined,
        ];
      })
    );
  }

  /** What the farm said, entry by entry. Everything it took leaves the phone; everything it
   *  refused stays, with its data and the reason. */
  /** Puts the farm's answer away and clears what it took. Written before deleted, every
   *  time: an entry in neither place is an entry nobody can account for. Safe to run again,
   *  because every step is a write to a known key or a delete of one. */
  private async finish(
    batch: PendingBatch,
    waiting: OutboxEntry[]
  ): Promise<void> {
    await this.settle(waiting, batch.verdicts ?? []);
    await this.options.storage.delete(PENDING_BATCH);
    await this.write(LAST_SYNC, this.now().toISOString());
  }

  private async settle(
    entries: OutboxEntry[],
    verdicts: EntryVerdict[]
  ): Promise<void> {
    const byId = new Map(verdicts.map((verdict) => [verdict.id, verdict]));
    for (const entry of entries) {
      const verdict = byId.get(entry.id);
      if (!verdict) {
        continue;
      }
      const held = HELD_UNDER[verdict.outcome];
      if (held) {
        const kept: Held = {
          entry,
          reason: verdict.reason ?? "",
          ...(verdict.refusal ? { refusal: verdict.refusal } : {}),
        };
        // Written first. An entry the farm refused, or took and put in front of somebody,
        // is still the only record on this phone of what a person wrote down.
        // oxlint-disable-next-line no-await-in-loop
        await this.write(`${held}${entry.id}`, kept);
      }
      // oxlint-disable-next-line no-await-in-loop
      await this.options.storage.delete(entryKey(entry.seq, entry.id));
    }
  }

  /** The send did not get through. A signed-out phone stops and asks; anything else waits
   *  and tries again, further off each time. */
  private async stumble(batch: PendingBatch, error: unknown): Promise<void> {
    if (isSignedOut(error)) {
      this.paused = "signed_out";
      await this.write(PAUSED, "signed_out");
      await this.write(PENDING_BATCH, { ...batch, lastError: "signed out" });
      return;
    }
    const retryCount = batch.retryCount + 1;
    const message = (error as Error)?.message ?? "could not send";
    if (
      isRefusal(error) ||
      !this.options.retry.shouldRetry(error as Error, retryCount)
    ) {
      // The farm will not take this batch however often it is offered. Its entries go to
      // the refused list with their data rather than blocking everything behind them.
      const waiting = await this.pending();
      const stuck = waiting.filter((entry) =>
        batch.entryIds.includes(entry.id)
      );
      await this.settle(
        stuck,
        stuck.map((entry) => ({
          id: entry.id,
          seq: entry.seq,
          outcome: "rejected" as const,
          reason: message,
        }))
      );
      await this.options.storage.delete(PENDING_BATCH);
      return;
    }
    await this.write(PENDING_BATCH, {
      ...batch,
      retryCount,
      nextAttemptAt:
        this.now().getTime() + this.options.retry.calculateDelay(retryCount),
      lastError: message,
    });
  }
}
