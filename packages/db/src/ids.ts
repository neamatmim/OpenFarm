const BYTE = 256;
const UUID_BYTES = 16;
const HEX = 16;
const HEX_GROUPS = [8, 12, 16, 20] as const;
const TIMESTAMP_BYTES = 6;
const VERSION_7 = 0x70;
const VARIANT_RFC = 0x80;
const NIBBLE = 16;
const TWO_BITS = 64;

/** UUIDv7 (RFC 9562): time-ordered ids generated on the writer, so a replayed write
 *  carries the same id and conflicts into a no-op. Arithmetic rather than bitwise so the
 *  48-bit millisecond timestamp stays exact. */
export const uuidv7 = (now: Date = new Date()): string => {
  const bytes = new Uint8Array(UUID_BYTES);
  crypto.getRandomValues(bytes);

  let ms = now.getTime();
  for (let i = TIMESTAMP_BYTES - 1; i >= 0; i -= 1) {
    bytes[i] = ms % BYTE;
    ms = Math.floor(ms / BYTE);
  }
  bytes[6] = VERSION_7 + ((bytes[6] ?? 0) % NIBBLE);
  bytes[8] = VARIANT_RFC + ((bytes[8] ?? 0) % TWO_BITS);

  const hex = [...bytes].map((b) => b.toString(HEX).padStart(2, "0")).join("");
  const [a, b, c, d] = HEX_GROUPS;
  return `${hex.slice(0, a)}-${hex.slice(a, b)}-${hex.slice(b, c)}-${hex.slice(c, d)}-${hex.slice(d)}`;
};
