import { z } from "zod";

import {
  LINK_WAYS,
  applicationLinks,
  linkInput,
  makeApplicationLink,
  sendApplicationLink,
  withdrawApplicationLink,
} from "../application-links";
import { protectedProcedure } from "../index";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";

/** The Owner's, from a sign-in of their own: whom the farm asks to apply, and what comes back (ADR 0034). */
const owners = protectedProcedure
  .use(requireOnly("owner", OWNER_ONLY))
  .use(requirePersonalSession());

/** The Owner's side of Applications: the links they make, and the Applications those bring back. */
export const applicationsRouter = {
  /** The farm's links, newest first, with where each stands. */
  links: owners.handler(({ context }) => applicationLinks(context)),

  /**
   * An Application Link for somebody the Owner knows: name, mobile, email, person or Organization. Answers the address
   * once, and emails it unless the Owner says not to (`makeApplicationLink`).
   */
  makeLink: owners
    .input(linkInput)
    .handler(({ context, input }) => makeApplicationLink(context, input)),

  /** Sends a link again, by email or by text, under a new secret: the address sent before stops opening. */
  sendLink: owners
    .input(z.object({ id: z.string().min(1), by: z.enum(LINK_WAYS) }))
    .handler(({ context, input }) =>
      sendApplicationLink(context, input.id, input.by)
    ),

  /** Withdraws a link not yet used. */
  withdrawLink: owners
    .input(z.object({ id: z.string().min(1) }))
    .handler(({ context, input }) =>
      withdrawApplicationLink(context, input.id)
    ),
};
