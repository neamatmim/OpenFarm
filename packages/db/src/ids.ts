const BYTE = 256;
const UUID_BYTES = 16;
const HEX = 16;
const HEX_GROUPS = [8, 12, 16, 20] as const;
const TIMESTAMP_BYTES = 6;
const VERSION_7 = 0x70;
const VARIANT_RFC = 0x80;
const TWO_BITS = 64;
/** rand_a is 12 bits: a counter, so ids made in the same millisecond still sort in order. */
const COUNTER_SPAN = 4096;

let lastMs = -1;
let counter = 0;

/**
 * UUIDv7 (RFC 9562): time-ordered ids generated on the writer, so a replayed write carries
 * the same id and conflicts into a no-op.
 *
 * The 12 bits of `rand_a` hold a monotonic counter (RFC 9562 §6.2, "fixed-length dedicated
 * counter") rather than randomness, so several ids taken within one millisecond — an audit
 * event and the row it describes, or a batch of moves — sort in the order they were made.
 * Ordering is what the audit trail reads back, so it cannot be left to chance.
 *
 * Arithmetic rather than bitwise, so the 48-bit millisecond timestamp stays exact.
 */
export const uuidv7 = (now: Date = new Date()): string => {
  const bytes = new Uint8Array(UUID_BYTES);
  crypto.getRandomValues(bytes);

  const nowMs = now.getTime();
  if (nowMs === lastMs) {
    counter = (counter + 1) % COUNTER_SPAN;
  } else {
    lastMs = nowMs;
    counter = 0;
  }

  let ms = nowMs;
  for (let i = TIMESTAMP_BYTES - 1; i >= 0; i -= 1) {
    bytes[i] = ms % BYTE;
    ms = Math.floor(ms / BYTE);
  }
  bytes[6] = VERSION_7 + Math.floor(counter / BYTE);
  bytes[7] = counter % BYTE;
  bytes[8] = VARIANT_RFC + ((bytes[8] ?? 0) % TWO_BITS);

  const hex = [...bytes].map((b) => b.toString(HEX).padStart(2, "0")).join("");
  const [a, b, c, d] = HEX_GROUPS;
  return `${hex.slice(0, a)}-${hex.slice(a, b)}-${hex.slice(b, c)}-${hex.slice(c, d)}-${hex.slice(d)}`;
};
