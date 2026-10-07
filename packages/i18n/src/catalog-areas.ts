/**
 * The areas of the farm's words read only at a desk or in the portal, by the first part of their key. Their words live
 * in `messages/*-desk.ts` and reach a browser after the shed's (`catalog.browser.ts`): a Shed Phone's first screen
 * downloads the rest — about a third of every language — only once it is drawn.
 */
export const DESK_AREAS: ReadonlySet<string> = new Set([
  "portal",
  "agreeInApp",
  "templates",
  "ventures",
  "returns",
  "investors",
  "plan",
  "audit",
  "auditField",
  "years",
  "digest",
  "push",
]);
