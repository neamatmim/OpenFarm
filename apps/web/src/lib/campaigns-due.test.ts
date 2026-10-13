import { describe, expect, it } from "vitest";

import { pensToRaise } from "./campaigns-due";

describe("the Pens a Campaign is raised in from the list of those due", () => {
  it("are those holding an animal whose day has come, each once, never one where it already stands open", () => {
    expect(
      pensToRaise([
        { penId: "a", standing: "due", raisedOpen: false },
        { penId: "a", standing: "due", raisedOpen: false },
        { penId: "b", standing: "due", raisedOpen: true },
        { penId: "c", standing: "soon", raisedOpen: false },
      ])
    ).toEqual(["a"]);
  });
});
