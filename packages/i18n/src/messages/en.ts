import { enCore } from "./en-core";
import { enDesk } from "./en-desk";

/** Every English word, for the server, the tests and the types: the shed's (./en-core.ts) and the desk's
 *  (./en-desk.ts). Bangla in ./bn.ts is the product. The browser fetches the two halves apart. */
export const en = { ...enCore, ...enDesk } as const;

export type MessageKey = keyof typeof en;
