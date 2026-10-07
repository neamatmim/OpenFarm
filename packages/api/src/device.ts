import type { Database } from "@OpenFarm/db";
import { and, eq, gt, lt } from "@OpenFarm/db/operators";
import { deviceSwitch, shedPhone } from "@OpenFarm/db/schema/device";
import { verifyPin } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

/** Headers a Shed Phone sends: the device's token, and the switch token it got by proving
 *  a PIN. The active *person* is never client-asserted — the token names them. */
export { DEVICE_TOKEN_HEADER, SWITCH_TOKEN_HEADER } from "./device-headers";

const LAST_SEEN_INTERVAL_MS = 5 * 60_000;

export interface DeviceSession {
  id: string;
  name: string;
  farmId: string;
  /** Null when the phone is enrolled but nobody has PIN-switched in yet. */
  activeUserId: string | null;
}

/** Why a phone's token did not resolve, so the phone's own screen can say what to do
 *  instead of every request failing with a 500. */
export type DeviceStatus = "none" | "ok" | "unknown" | "revoked" | "locked";

export const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

const randomHex = (bytes: number): string => {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};

export const randomToken = (): string => randomHex(32);

/** Crockford base32 without the letters that look like digits, so a code can be read out
 *  loud and typed without ambiguity. Ten characters is ~10^15 possibilities. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 10;

export const randomEnrolmentCode = (): string => {
  const values = new Uint8Array(CODE_LENGTH);
  let code = "";
  // Rejection sampling: 256 is not a multiple of 32, so bytes ≥ 256 - (256 % 32) would
  // bias the alphabet. With 32 it divides exactly, but the guard keeps that true if the
  // alphabet ever changes.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  while (code.length < CODE_LENGTH) {
    crypto.getRandomValues(values);
    for (const value of values) {
      if (value < limit && code.length < CODE_LENGTH) {
        code += CODE_ALPHABET[value % CODE_ALPHABET.length];
      }
    }
  }
  return code;
};

/**
 * Resolves the phone a request came from, and who proved a PIN on it.
 *
 * Never throws: a phone whose token is unknown or revoked must still be able to reach
 * `devices.claim` to enrol again, and a locked phone must still be able to read the roster.
 * The status travels on the context so procedures and the phone's own screen can react.
 */
export const resolveDeviceSession = async (
  db: Database,
  token: string,
  switchToken: string | null,
  now: Date
): Promise<{ device: DeviceSession | null; status: DeviceStatus }> => {
  const phone = await db.query.shedPhone.findFirst({
    where: { tokenHash: await hashToken(token) },
  });
  if (!phone) {
    return { device: null, status: "unknown" };
  }
  if (phone.revokedAt) {
    return { device: null, status: "revoked" };
  }

  const seenIsStale =
    !phone.lastSeenAt ||
    now.getTime() - phone.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS;
  if (seenIsStale) {
    // Telemetry, not a farm record: deliberately outside audited() — an audit event per
    // request would drown the log — and written at most once every few minutes.
    await db
      .update(shedPhone)
      .set({ lastSeenAt: now })
      .where(eq(shedPhone.id, phone.id));
  }

  const device: DeviceSession = {
    id: phone.id,
    name: phone.name,
    farmId: phone.farmId,
    activeUserId: null,
  };
  if (!switchToken) {
    return { device, status: "locked" };
  }

  const session = await db.query.deviceSwitch.findFirst({
    where: { tokenHash: await hashToken(switchToken), deviceId: phone.id },
  });
  if (!session || session.expiresAt <= now) {
    return { device, status: "locked" };
  }
  return { device: { ...device, activeUserId: session.userId }, status: "ok" };
};

/** Checks a PIN against what the farm stored. The server proves it here; the phone's local
 *  check (ADR 0003) is what keeps PIN Switch working when there is no signal. */
export const checkPin = async (
  db: Database,
  farmId: string,
  userId: string,
  pin: string
): Promise<boolean> => {
  const stored = await db.query.staffPin.findFirst({
    where: { userId, farmId },
  });
  if (!stored) {
    return false;
  }
  return verifyPin(pin, stored.salt, stored.hash);
};

/**
 * PIN Switch sessions are authentication state, not farm records, so — like `lastSeenAt`
 * and Better Auth's own session rows — they are written here in the auth layer rather than
 * through `audited()`. The *act* of switching is still audited, by the router.
 */
export const openSwitch = async (
  /** The transaction the switch is audited in, so the act and its record stand or fall together. */
  db: Pick<Database, "insert">,
  {
    id,
    deviceId,
    userId,
    token,
    expiresAt,
    now,
  }: {
    id: string;
    deviceId: string;
    userId: string;
    token: string;
    expiresAt: Date;
    now: Date;
  }
): Promise<void> => {
  await db.insert(deviceSwitch).values({
    id,
    deviceId,
    userId,
    tokenHash: await hashToken(token),
    expiresAt,
    createdAt: now,
  });
};

/** Keeps a phone unlocked while it is being used, rather than locking mid-task. */
export const extendSwitch = async (
  db: Database,
  deviceId: string,
  userId: string,
  until: Date,
  now: Date
): Promise<void> => {
  // Only the stint still open: one the phone locked, or that ran out, stays ended — waking it would make good again
  // every old token the phone still holds.
  await db
    .update(deviceSwitch)
    .set({ expiresAt: until })
    .where(
      and(
        eq(deviceSwitch.deviceId, deviceId),
        eq(deviceSwitch.userId, userId),
        gt(deviceSwitch.expiresAt, now)
      )
    );
};

/** Keeps one stint open until at least `until`, for work the farm hears of late that was done on it: what the phone
 *  recorded is proof it was in her hands then. Only ever later — a stint already open longer keeps its own end. */
export const stretchSwitch = async (
  db: Pick<Database, "update">,
  id: string,
  until: Date
): Promise<void> => {
  await db
    .update(deviceSwitch)
    .set({ expiresAt: until })
    .where(and(eq(deviceSwitch.id, id), lt(deviceSwitch.expiresAt, until)));
};

/** Locks a phone: its switch sessions expire at once. Rows stay, so the audit of who was
 *  working when is not rewritten. */
export const closeSwitches = async (
  db: Database,
  deviceId: string,
  now: Date,
  /** Only this person's, where one person's lock is meant; everybody's when the phone itself is put away. */
  only?: { userId: string }
): Promise<void> => {
  await db
    .update(deviceSwitch)
    .set({ expiresAt: now })
    .where(
      only
        ? and(
            eq(deviceSwitch.deviceId, deviceId),
            eq(deviceSwitch.userId, only.userId),
            gt(deviceSwitch.expiresAt, now)
          )
        : eq(deviceSwitch.deviceId, deviceId)
    );
};

/** The shed phone this request comes from, or a refusal: one taken off the farm's list — revoked, or forgotten — is told
 *  so in a word the phone acts on, forgetting its token so it can be enrolled again, rather than passing for a phone
 *  with no signal and keeping its work from the farm. */
export const requireDevice = <T>(
  device: T | null,
  status: DeviceStatus = "none"
): T => {
  if (!device) {
    if (status === "revoked" || status === "unknown") {
      throw new ORPCError("FORBIDDEN", {
        message: "This phone is no longer one of the farm's: enrol it again",
        data: { refusal: "phone_revoked" },
      });
    }
    throw new ORPCError("FORBIDDEN", {
      message: "Only a shed phone may do this",
    });
  }
  return device;
};
