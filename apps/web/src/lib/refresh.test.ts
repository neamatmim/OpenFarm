import {
  MutationCache,
  MutationObserver,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { refreshAfterASave } from "./refresh";

// Buying medicine books money too, and the money list opened straight after did not show it: the sheet refreshed
// the Drug List, and the money list was still inside its minute of freshness. A save now refreshes the screen
// whichever sheet made it, and these read that through a real query client.

/** A query client as the app makes it, with nothing retried, so a refusal is a refusal at once. */
const aClient = () =>
  new QueryClient({
    mutationCache: new MutationCache({ onSuccess: refreshAfterASave }),
    defaultOptions: {
      queries: { staleTime: 60 * 1000, retry: false },
      mutations: { retry: false },
    },
  });

/** A read on the screen, counting how often the farm is asked for it. */
const onScreen = async (client: QueryClient, path: [string, string]) => {
  let asked = 0;
  const observer = new QueryObserver(client, {
    queryKey: [path, { type: "query" }],
    queryFn: () => {
      asked += 1;
      return Promise.resolve(asked);
    },
  });
  const unsubscribe = observer.subscribe(() => {
    // on screen for as long as it is subscribed
  });
  await client.refetchQueries({ queryKey: [path] });
  return { asked: () => asked, unsubscribe, key: [path, { type: "query" }] };
};

/** A save through oRPC's key for its procedure, which the farm takes — or refuses. No procedure is a save that
 *  only went into the phone's Outbox. */
const save = async (
  client: QueryClient,
  path: [string, string] | null,
  refused = false
) => {
  const observer = new MutationObserver(client, {
    ...(path ? { mutationKey: [path, { type: "mutation" }] } : {}),
    mutationFn: () =>
      refused ? Promise.reject(new Error("refused")) : Promise.resolve("taken"),
  });
  await observer.mutate().catch(() => "refused");
  // The refresh is not waited for by the sheet; the test waits for it to land.
  await client.refetchQueries({ stale: true, type: "active" });
};

describe("a save refreshes the screen", () => {
  it("reads again what is on the screen, from another part of the farm than the save's own", async () => {
    const client = aClient();
    const money = await onScreen(client, ["money", "list"]);
    expect(money.asked()).toBe(1);

    await save(client, ["drugs", "purchase"]);

    expect(money.asked()).toBe(2);
    money.unsubscribe();
  });

  it("leaves what is not on the screen to be read when it is next opened, not a minute later", async () => {
    const client = aClient();
    const money = await onScreen(client, ["money", "list"]);
    money.unsubscribe();

    await save(client, ["drugs", "purchase"]);

    // Not read while nobody looks at it, but no longer taken as fresh: opening it reads it.
    expect(money.asked()).toBe(1);
    expect(client.getQueryState(money.key)?.isInvalidated).toBe(true);
  });

  it("reads nothing again when the farm refused the save", async () => {
    const client = aClient();
    const money = await onScreen(client, ["money", "list"]);

    await save(client, ["drugs", "purchase"], true);

    expect(money.asked()).toBe(1);
    money.unsubscribe();
  });

  it("leaves the saves the app makes on opening to refresh once, at the end", async () => {
    const client = aClient();
    const work = await onScreen(client, ["instances", "today"]);

    await save(client, ["instances", "ensureDue"]);
    await save(client, ["alerts", "sweep"]);
    await save(client, ["alerts", "digest"]);

    expect(work.asked()).toBe(1);
    work.unsubscribe();
  });

  it("reads nothing again for an entry the phone only queued for the Outbox", async () => {
    const client = aClient();
    const work = await onScreen(client, ["instances", "byId"]);

    await save(client, null);

    expect(work.asked()).toBe(1);
    work.unsubscribe();
  });
});
