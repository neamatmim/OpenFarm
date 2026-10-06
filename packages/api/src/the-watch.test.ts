import { describe, expect, it } from "vitest";

import { pingTheWatch } from "./the-watch";

// The farm's own alarms run inside the app, so a server down or an app dead tells nobody. An outside watch hears from the
// farm after every whole turn, and raises the alarm itself when it stops hearing — the Owner's to set up.

describe("the outside watch", () => {
  it("is told after a whole turn, at the address the Owner set", async () => {
    const asked: string[] = [];
    await pingTheWatch("https://hc-ping.example/farm", (url) => {
      asked.push(url);
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    expect(asked).toEqual(["https://hc-ping.example/farm"]);
  });

  it("is nothing where the Owner has set none", async () => {
    const asked: string[] = [];
    await pingTheWatch(undefined, (url) => {
      asked.push(url);
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    expect(asked).toEqual([]);
  });

  it("never stands in the farm's way when the watch does not answer", async () => {
    await expect(
      pingTheWatch("https://hc-ping.example/farm", () =>
        Promise.reject(new Error("no signal"))
      )
    ).resolves.toBeUndefined();
  });
});
