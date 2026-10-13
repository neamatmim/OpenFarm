import { ORPCError } from "@orpc/server";

/** Refused, with the word the screen says it in, and whatever else the screen needs to say it. */
export const refuse = (
  refusal: string,
  message: string,
  more: Record<string, unknown> = {}
) => new ORPCError("BAD_REQUEST", { message, data: { ...more, refusal } });
