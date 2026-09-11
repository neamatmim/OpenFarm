import type {
  LeaderElection,
  OnlineDetector,
  RetryPolicy,
  StorageAdapter,
} from "@tanstack/offline-transactions";

/** One thing a phone recorded, waiting to be told to the farm. The shape the batch
 *  procedure takes, plus what the outbox needs to send it in order. */
export interface OutboxEntry {
  /** The client's own id for the record. The same entry sent twice is one fact. */
  id: string;
  /** Where this sits in the phone's own count, so the farm can see what it never read. */
  seq: number;
  kind:
    | "instance_claim"
    | "step_completion"
    | "completion_photo"
    | "instance_complete"
    | "animal_move"
    | "observation";
  /** The entry as the batch procedure wants it, minus the fields above. */
  body: Record<string, unknown>;
  /** The phone's clock, at the moment the person recorded it. */
  recordedAt: string;
}

/** What the farm said about one entry. */
export interface EntryVerdict {
  id: string;
  seq: number;
  outcome: "applied" | "flagged" | "kept" | "rejected";
  reason?: string;
}

/** A send in flight: the entries, and the one key they go under. The key is made before the
 *  first attempt and kept for every retry, so a reply lost on the way back cannot become a
 *  second set of records (ADR 0002). */
interface PendingBatch {
  key: string;
  entryIds: string[];
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
    entries: Record<string, unknown>[];
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
  async add(
    kind: OutboxEntry["kind"],
    body: Record<string, unknown>,
    id: string
  ): Promise<OutboxEntry> {
    const seq = await this.takeSeq();
    const entry: OutboxEntry = {
      id,
      seq,
      kind,
      body,
      recordedAt: this.now().toISOString(),
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

  private async under(
    prefix: string
  ): Promise<{ entry: OutboxEntry; reason: string }[]> {
    const keys = await this.options.storage.keys();
    const rows: { entry: OutboxEntry; reason: string }[] = [];
    for (const key of keys.filter((one) => one.startsWith(prefix)).toSorted()) {
      // oxlint-disable-next-line no-await-in-loop
      const row = await this.read<{ entry: OutboxEntry; reason: string }>(key);
      if (row) {
        rows.push(row);
      }
    }
    return rows;
  }

  /** What the farm sent back, with the data the person entered, so they can put it right. */
  rejected(): Promise<{ entry: OutboxEntry; reason: string }[]> {
    return this.under(REJECTED);
  }

  /** What the farm took but put in front of somebody. */
  reviewed(): Promise<{ entry: OutboxEntry; reason: string }[]> {
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
    const entries = waiting.filter((entry) =>
      batch.entryIds.includes(entry.id)
    );
    try {
      const answer = await this.options.transport.send({
        key: batch.key,
        sentAt: this.now().toISOString(),
        entries: entries.map((entry) => ({
          ...entry.body,
          id: entry.id,
          seq: entry.seq,
          kind: entry.kind,
          recordedAt: entry.recordedAt,
        })),
      });
      // Written down first. From here the batch is settled business whatever becomes of the
      // phone; what is left is bookkeeping the next flush can finish.
      const answered = { ...batch, verdicts: answer.results };
      await this.write(PENDING_BATCH, answered);
      await this.finish(answered, waiting);
      return { sent: entries.length, verdicts: answer.results };
    } catch (error) {
      await this.stumble(batch, error);
      return nothing;
    }
  }

  /** The batch in flight, or a new one over what is waiting. The key outlives the attempt. */
  private async batchFor(waiting: OutboxEntry[]): Promise<PendingBatch> {
    const inFlight = await this.read<PendingBatch>(PENDING_BATCH);
    if (inFlight) {
      const still = new Set(waiting.map((entry) => entry.id));
      const kept = inFlight.entryIds.filter((id) => still.has(id));
      if (kept.length > 0) {
        return { ...inFlight, entryIds: kept };
      }
    }
    const fresh: PendingBatch = {
      key: this.newKey(),
      entryIds: takeWhatFits(waiting).map((entry) => entry.id),
      retryCount: 0,
      nextAttemptAt: 0,
    };
    await this.write(PENDING_BATCH, fresh);
    return fresh;
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
        // Written first. An entry the farm refused, or took and put in front of somebody,
        // is still the only record on this phone of what a person wrote down.
        // oxlint-disable-next-line no-await-in-loop
        await this.write(`${held}${entry.id}`, {
          entry,
          reason: verdict.reason ?? "",
        });
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
