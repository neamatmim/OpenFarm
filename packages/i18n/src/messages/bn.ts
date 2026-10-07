import { bnCore } from "./bn-core";
import { bnDesk } from "./bn-desk";
import type { MessageKey } from "./en";

/** Every Bangla word, for the server, the tests and the types: the shed's and the desk's halves together. */
export const bn: Record<MessageKey, string> = { ...bnCore, ...bnDesk };
