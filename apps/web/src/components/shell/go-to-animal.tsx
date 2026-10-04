import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** How many Tag Numbers the box offers as one is typed: enough to choose from, few enough to read at once. */
const OFFERED = 6;

/** Whether the keyboard's shortcut is said as the Mac's ⌘ or everybody else's Ctrl. */
const onMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/u.test(navigator.platform);

/** The Tag Numbers the farm has that hold what is typed, those that start with it first. */
const offeredFor = (tags: string[], needle: string) => {
  if (!needle) {
    return [];
  }
  const starting = tags.filter((tag) => tag.startsWith(needle));
  const holding = tags.filter(
    (tag) => !tag.startsWith(needle) && tag.includes(needle)
  );
  return [...starting, ...holding].slice(0, OFFERED);
};

/** The box itself: a Tag Number typed, the animals it could be offered under it, Enter opens one. */
const GoToAnimalDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useT();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [chosen, setChosen] = useState(0);
  const animals = useQuery({
    ...orpc.animals.list.queryOptions({ input: { includeExited: false } }),
    enabled: open,
  });
  const needle = typed.trim().toUpperCase();
  const offered = offeredFor(
    (animals.data ?? []).map((one) => one.tagNumber),
    needle
  );
  const shown = Math.min(chosen, Math.max(offered.length - 1, 0));

  const handleOpenChange = (now: boolean) => {
    onOpenChange(now);
    if (!now) {
      setTyped("");
      setChosen(0);
    }
  };
  const go = (tag: string) => {
    handleOpenChange(false);
    navigate({ to: "/animals/$tagNumber", params: { tagNumber: tag } });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && offered.length > 0) {
      event.preventDefault();
      setChosen((shown + 1) % offered.length);
    } else if (event.key === "ArrowUp" && offered.length > 0) {
      event.preventDefault();
      setChosen((shown - 1 + offered.length) % offered.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // A whole Tag Number typed goes to her even before the list has come; otherwise the one chosen.
      const exact = offered.includes(needle) ? needle : offered[shown];
      const tag = exact ?? needle;
      if (tag) {
        go(tag);
      }
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className="top-[20%] translate-y-0 sm:max-w-md"
        closeLabel={t("common.close")}
      >
        <DialogHeader>
          <DialogTitle>{t("goTo.title")}</DialogTitle>
          <DialogDescription>{t("goTo.hint")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            aria-label={t("animals.search")}
            autoComplete="off"
            autoFocus
            className="pl-9 font-mono"
            onChange={(event) => {
              setTyped(event.target.value);
              setChosen(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("animals.searchPlaceholder")}
            value={typed}
          />
        </div>
        {/* Each match a button, so a tab or a press reaches it as well as the arrow keys and Enter from the box. */}
        <ul aria-label={t("goTo.matches")} className="flex flex-col gap-0.5">
          {offered.map((tag, at) => (
            <li key={tag}>
              <button
                className={cn(
                  "w-full rounded-md px-3 py-2 text-start font-mono text-sm",
                  "hover:bg-accent focus-visible:ring-ring outline-none focus-visible:ring-2",
                  at === shown && "bg-accent text-accent-foreground"
                )}
                onClick={() => go(tag)}
                onFocus={() => setChosen(at)}
                onMouseEnter={() => setChosen(at)}
                type="button"
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
        {needle && animals.data && offered.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("animals.noMatch")}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

/**
 * "Go to Tag Number", from any page: a box in the top bar on a desk, and Ctrl+K (⌘K on a Mac) everywhere, the
 * shortcut enterprise apps keep for jumping to a record (GitHub, Linear, Atlassian). The Tag Number is how the farm
 * names an animal, so it is what the box takes.
 */
export const GoToAnimal = () => {
  const t = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const listen = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, []);
  return (
    <>
      <Button
        className="text-muted-foreground hidden w-56 justify-start gap-2 md:inline-flex"
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        <Search aria-hidden data-icon="inline-start" />
        <span className="flex-1 text-start">{t("goTo.label")}</span>
        <kbd className="bg-muted rounded px-1.5 font-sans text-xs">
          {onMac() ? "⌘K" : "Ctrl K"}
        </kbd>
      </Button>
      <GoToAnimalDialog onOpenChange={setOpen} open={open} />
    </>
  );
};
