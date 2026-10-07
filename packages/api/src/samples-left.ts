import { env } from "@OpenFarm/env/server";

/** The names documentation keeps for itself (RFC 2606): nobody's farm, nobody's mailbox. */
const A_SAMPLE_NAME = /(?:^|[.@/])example\.(?:com|org|net)(?:$|[:/?#])/iu;

/** The settings a copy of `.env.example` once filled with samples, and the address the farm's Owner signs up from. */
const READ = [
  "BETTER_AUTH_URL",
  "PORTAL_URL",
  "OPENFARM_OWNER_EMAIL",
  "VAPID_SUBJECT",
  "OPENFARM_WATCH_URL",
] as const;

type Read = (typeof READ)[number];

/**
 * The settings still holding a sample, for a production server to refuse to start on. A copied example once set the
 * Owner's address to one nobody on the farm holds — whoever could receive mail there could set the farm up — and a
 * push subject the provider rejects.
 */
export const samplesLeft = (
  values: Partial<Record<Read, string | undefined>> = env
): Read[] =>
  READ.filter((name) => {
    const value = values[name];
    return value !== undefined && A_SAMPLE_NAME.test(value);
  });
