/**
 * A Staff member's 4-digit PIN, verified on the Shed Phone itself so PIN Switch works with
 * no signal (ADR 0003). The device holds the salt and the derived hash, never the PIN.
 *
 * A 4-digit PIN has only 10,000 possibilities, so anyone holding the hash can search it
 * exhaustively; the cost per guess is the only defence. PBKDF2 at this iteration count puts
 * a full search in the order of hours on a phone — enough time for the Manager to revoke a
 * lost device, which is the mitigation the ADR relies on. PINs gate *attribution on a
 * farm-provided phone*, not remote access: a device token is still required, and it is
 * revocable.
 */
const ITERATIONS = 210_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;
/** How many digits a PIN has: what the farm takes, and what the Shed Phone's keypad waits for. */
export const PIN_LENGTH = 4;
const PIN_PATTERN = new RegExp(`^\\d{${PIN_LENGTH}}$`, "u");

export const isPin = (pin: string): boolean => PIN_PATTERN.test(pin);

/** How far one digit is from the next, going round from 9 to 0: 1 up, 9 down. */
const stepOf = (from: number, to: number) => (to - from + 10) % 10;

/**
 * A PIN the whole shed would try first: one digit four times, or a run up or down — 1234, 7890, 9876. Ten thousand
 * guesses is little enough; these are the first ten anybody tries. Refused when it is set (the farm's default,
 * 2026-10-07).
 */
export const isTooEasyPin = (pin: string): boolean => {
  const digits = [...pin].map(Number);
  const steps = digits
    .slice(1)
    .map((digit, at) => stepOf(digits[at] ?? 0, digit));
  const [first] = steps;
  return (
    first !== undefined &&
    [0, 1, 9].includes(first) &&
    steps.every((step) => step === first)
  );
};

const toBase64 = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(""));

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const characters = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(characters.length));
  for (let i = 0; i < characters.length; i += 1) {
    bytes[i] = characters.codePointAt(i) ?? 0;
  }
  return bytes;
};

export const randomPinSalt = (): string => {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
};

/** The hash a device stores and checks a typed PIN against. */
export const derivePinHash = async (
  pin: string,
  salt: string
): Promise<string> => {
  if (!isPin(pin)) {
    throw new Error(`A PIN is ${PIN_LENGTH} digits`);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromBase64(salt),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    KEY_BITS
  );
  return toBase64(new Uint8Array(bits));
};

/** Constant-time comparison, so a wrong PIN reveals nothing by how long it took. */
export const verifyPin = async (
  pin: string,
  salt: string,
  hash: string
): Promise<boolean> => {
  if (!isPin(pin)) {
    return false;
  }
  const candidate = await derivePinHash(pin, salt);
  if (candidate.length !== hash.length) {
    return false;
  }
  // Bitwise on purpose: the comparison must take the same time whether the first character
  // matches or the last, so it cannot short-circuit.
  // oxlint-disable no-bitwise
  let difference = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    difference |= (candidate.codePointAt(i) ?? 0) ^ (hash.codePointAt(i) ?? 0);
  }
  // oxlint-enable no-bitwise
  return difference === 0;
};
