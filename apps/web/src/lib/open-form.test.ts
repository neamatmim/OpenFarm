import { describe, expect, it } from "vitest";

import { holdOpenForm, sayInOpenForm } from "./open-form";

describe("a refusal while a form is open", () => {
  it("is said in the form on top, then in the one under it once that closes", () => {
    const sheet: string[] = [];
    const dialog: string[] = [];
    const closeSheet = holdOpenForm((words) => sheet.push(words));
    const closeDialog = holdOpenForm((words) => dialog.push(words));

    expect(sayInOpenForm("over the sheet")).toBe(true);
    closeDialog();
    expect(sayInOpenForm("back in the sheet")).toBe(true);
    closeSheet();

    expect(dialog).toEqual(["over the sheet"]);
    expect(sheet).toEqual(["back in the sheet"]);
  });

  it("is left to a toast when no form is open", () => {
    expect(sayInOpenForm("nowhere to say it")).toBe(false);
  });
});
