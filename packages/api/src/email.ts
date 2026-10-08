/** One email: a subject and plain words. The farm sends only short ones — a code and what it is for — never a paper. */
export interface EmailMessage {
  subject: string;
  text: string;
}

/**
 * How an email actually leaves the farm. An interface for the reason the text message's is one: the tests send to a
 * fake, development sends nowhere, and at go-live the Owner's own account is configured with credentials the Owner
 * holds — so the path is built and tested before the account exists.
 */
export interface EmailTransport {
  /** Whether the farm has an account to send from at all: without one, nothing offers to send. */
  sends: boolean;
  send: (to: string, message: EmailMessage) => Promise<{ delivered: boolean }>;
}

/** A farm with no email account configured is a farm that does not send email. */
export const silentEmail: EmailTransport = {
  sends: false,
  send: () => Promise.resolve({ delivered: false }),
};
