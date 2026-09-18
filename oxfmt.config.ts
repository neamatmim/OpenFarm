import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Ultracite reflows prose onto one long line. The farm's writing is wrapped on purpose — the README,
  // the wayfinder maps and every ticket — and unwrapping it makes a diff of a sentence a diff of a
  // paragraph. Keep the lines as they were written; code formatting is untouched.
  proseWrap: "preserve",
});
