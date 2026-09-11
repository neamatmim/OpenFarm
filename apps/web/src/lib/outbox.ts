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
  kind: "step_completion" | "animal_move" | "observation";
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
const PENDING_BATCH = "batch:pending";
const NEXT_SEQ = "meta:seq";
const LAST_SYNC = "meta:lastSync";
/** Sequence numbers are padded so the storage adapter's key order is the order the work
 *  happened: a phone sends what it recorded first, first. */
const SEQ_WIDTH = 12;

const entryKey = (seq: number) =>
  `${ENTRY}${String(seq).padStart(SEQ_WIDTH, "0")}`;

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

/** An error the farm will never accept, however often it is offered. */
const isRefusal = (error: unknown): boolean => {
  const status = (error as { status?: number } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500;
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
    const next = (await this.read<number>(NEXT_SEQ)) ?? 1;
    await this.write(NEXT_SEQ, next + 1);
    return next;
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
    await this.write(entryKey(seq), entry);
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

  /** What the farm sent back, with the data the person entered, so they can put it right. */
  async rejected(): Promise<{ entry: OutboxEntry; reason: string }[]> {
    const keys = await this.options.storage.keys();
    const held: { entry: OutboxEntry; reason: string }[] = [];
    for (const key of keys
      .filter((one) => one.startsWith(REJECTED))
      .toSorted()) {
      // oxlint-disable-next-line no-await-in-loop
      const row = await this.read<{ entry: OutboxEntry; reason: string }>(key);
      if (row) {
        held.push(row);
      }
    }
    return held;
  }

  /** The person has dealt with a refused entry: it leaves the phone. */
  async discard(id: string): Promise<void> {
    await this.options.storage.delete(`${REJECTED}${id}`);
  }

  async state(): Promise<OutboxState> {
    const [waiting, refused, lastSyncAt] = await Promise.all([
      this.pending(),
      this.rejected(),
      this.read<string>(LAST_SYNC),
    ]);
    return {
      pending: waiting.length,
      rejected: refused.length,
      lastSyncAt,
      paused: this.paused,
    };
  }

  /** The person has signed in again. */
  resume(): void {
    this.paused = "none";
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
    if (this.flushing || this.paused !== "none") {
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
      await this.settle(entries, answer.results);
      await this.options.storage.delete(PENDING_BATCH);
      await this.write(LAST_SYNC, this.now().toISOString());
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
  private async settle(
    entries: OutboxEntry[],
    verdicts: EntryVerdict[]
  ): Promise<void> {
    const byId = new Map(verdicts.map((verdict) => [verdict.id, verdict]));
    for (const entry of entries) {
      const verdict = byId.get(entry.id);
      // oxlint-disable-next-line no-await-in-loop
      await this.options.storage.delete(entryKey(entry.seq));
      if (verdict?.outcome === "rejected") {
        // oxlint-disable-next-line no-await-in-loop
        await this.write(`${REJECTED}${entry.id}`, {
          entry,
          reason: verdict.reason ?? "refused",
        });
      }
    }
  }

  /** The send did not get through. A signed-out phone stops and asks; anything else waits
   *  and tries again, further off each time. */
  private async stumble(batch: PendingBatch, error: unknown): Promise<void> {
    if (isSignedOut(error)) {
      this.paused = "signed_out";
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
