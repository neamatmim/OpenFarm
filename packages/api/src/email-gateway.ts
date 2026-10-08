import { env } from "@OpenFarm/env/server";
import { createTransport } from "nodemailer";

import type { EmailMessage, EmailTransport } from "./email";
import { silentEmail } from "./email";

/** How long one email may take before the farm stops waiting on it: a mail server that will not answer must not become
 *  a portal page that will not answer. */
const SEND_TIMEOUT_MS = 10_000;

/**
 * The farm's own email account, over SMTP — which every provider offers, a Gmail app password included, where each
 * one's HTTP API is shaped its own way (ADR 0022's ticket 02).
 *
 * Configured at go-live and silent until then: a farm without an account sends no email, and its Investors agree with
 * the code by text, or on paper. Built and tested before the account exists, which is the point of the transport being
 * injected.
 */
export const emailGateway = (): EmailTransport => {
  const url = env.EMAIL_SMTP_URL?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!(url && from)) {
    return silentEmail;
  }
  const smtp = createTransport({
    url,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });
  return {
    sends: true,
    send: async (to: string, message: EmailMessage) => {
      try {
        const answer = await smtp.sendMail({
          from,
          to,
          subject: message.subject,
          text: message.text,
        });
        return { delivered: answer.accepted.length > 0 };
      } catch {
        // The mail server is somebody else's. An email that did not go is said so to whoever asked for it, who may ask
        // again; a throw here would say nothing more useful.
        return { delivered: false };
      }
    },
  };
};
