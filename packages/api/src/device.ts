import type { Database } from "@OpenFarm/db";
import { eq } from "@OpenFarm/db/operators";
import { shedPhone } from "@OpenFarm/db/schema/device";
import { ORPCError } from "@orpc/server";

/** Headers a Shed Phone sends: the device's token, and who is currently PIN-switched in. */
const LAST_SEEN_INTERVAL_MS = 5 * 60_000;

export const DEVICE_TOKEN_HEADER = "x-openfarm-device";
export const ACTIVE_USER_HEADER = "x-openfarm-active-user";

export interface DeviceSession {
  id: string;
  name: string;
  activeUserId: string;
}

/** Hash of a device token; the token itself is shown once and lives on the phone. */
export const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

export const randomToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};

/** A short code the Manager reads out to the phone once. */
export const randomEnrolmentCode = (): string => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(10).padStart(3, "0"))
    .join("")
    .slice(0, 8);
};

/**
 * Resolves the device a request came from, and who is acting on it. The active user must be
 * enrolled — that is, hold a PIN on this Farm — or the request is refused: a device token
 * alone attributes nothing (ADR 0003).
 */
export const resolveDeviceSession = async (
  db: Database,
  token: string,
  activeUserId: string | null,
  now: Date
): Promise<{ device: DeviceSession; farmId: string } | null> => {
  const phone = await db.query.shedPhone.findFirst({
    where: { tokenHash: await hashToken(token) },
  });
  if (!phone || phone.revokedAt) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "This phone is not enrolled",
    });
  }
  if (!activeUserId) {
    return null;
  }
  const enrolled = await db.query.staffPin.findFirst({
    where: { userId: activeUserId, farmId: phone.farmId },
    columns: { userId: true },
  });
  if (!enrolled) {
    throw new ORPCError("FORBIDDEN", {
      message: "That person is not enrolled on this phone",
    });
  }
  // Telemetry, not a farm record: deliberately outside audited() — an audit event per
  // request would drown the log — and written at most once every few minutes.
  const seenIsStale =
    !phone.lastSeenAt ||
    now.getTime() - phone.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS;
  if (seenIsStale) {
    await db
      .update(shedPhone)
      .set({ lastSeenAt: now })
      .where(eq(shedPhone.id, phone.id));
  }
  return {
    device: { id: phone.id, name: phone.name, activeUserId },
    farmId: phone.farmId,
  };
};
