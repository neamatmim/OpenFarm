import { loadDeskWords, loadMessages } from "@OpenFarm/i18n";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

import { pageLanguage } from "@/lib/page-context";
import { isShedFirst } from "@/lib/shed-first";

/**
 * TanStack Start's own entry, with one step first: the words of the language the server wrote the page in are
 * fetched before the page is taken over, so it is drawn again in the same words. The browser holds one language's
 * words, not both (`@OpenFarm/i18n`'s `#catalog`), and of those the desk's half only where the page needs it.
 */
await loadMessages(pageLanguage());
// A desk or portal page was written with every word: it is taken over with every word too. A Shed Phone's first screen
// needs only the shed's, and fetches the rest once it is drawn.
if (!isShedFirst(window.location.pathname)) {
  await loadDeskWords();
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>
  );
});

void loadDeskWords();
