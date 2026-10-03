import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, Sprout } from "lucide-react";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/wordmark";

/** What the dark side of a door says: a line, what is behind the door point by point, and a line at its foot. */
export interface DoorPromise {
  title: string;
  points: { icon: LucideIcon; text: string }[];
  foot: string;
}

/**
 * The one shape every way in shares — the farm's own sign-in and the Investor portal's: its promise on a dark side,
 * with the name at the top, and the form on the other. On a phone the promise folds away and the form comes first,
 * under the bar the page brings, which names the farm there instead.
 */
export const DoorScreen = ({
  home,
  subtitle,
  promise,
  header,
  footer,
  children,
}: {
  /** Where the name at the top leads: each door back to its own start, never across to the other. */
  home: "/" | "/portal";
  /** Under the name, where the door has one: the farm an Investor deals with. */
  subtitle?: string;
  promise: DoorPromise;
  /** The bar over the form: the reader's language and theme, and the name on a phone. */
  header: ReactNode;
  /** What is said under the form on every page of this door. */
  footer?: ReactNode;
  children: ReactNode;
}) => (
  <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
    <aside
      className="relative hidden overflow-hidden bg-[oklch(0.27_0.045_162)] px-10 text-[oklch(0.95_0.015_150)] lg:flex lg:flex-col xl:px-14"
      data-app-chrome
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-90 [background:radial-gradient(60rem_40rem_at_-10%_-10%,oklch(0.42_0.09_155/.55),transparent_60%),radial-gradient(40rem_30rem_at_110%_110%,oklch(0.55_0.1_85/.35),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(oklch(1_0_0)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0)_1px,transparent_1px)] [background-size:44px_44px] opacity-[0.07]"
      />
      {/* The same height as the bar across the form, so the name and the bar sit on one line. */}
      <Link
        className="relative flex h-16 w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        to={home}
      >
        <span className="grid size-9 place-items-center rounded-lg bg-white/10 ring-1 ring-white/20">
          <Sprout aria-hidden className="size-5" />
        </span>
        <span className="flex min-w-0 flex-col">
          <Wordmark size="lg" />
          {subtitle ? (
            <span className="truncate text-xs opacity-70">{subtitle}</span>
          ) : null}
        </span>
      </Link>
      <div className="relative flex max-w-xl flex-1 flex-col justify-center gap-8 py-10">
        <p className="text-4xl font-semibold text-balance xl:text-[2.75rem]">
          {promise.title}
        </p>
        <ul className="flex flex-col gap-4">
          {promise.points.map(({ icon: Icon, text }) => (
            <li className="flex items-center gap-3" key={text}>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="text-base opacity-90">{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative flex h-16 items-center text-sm opacity-60">
        {promise.foot}
      </p>
    </aside>
    <div className="flex flex-col">
      {header}
      {/* Held off the bottom by the header's own height, so the form is centred on the same line as the promise. */}
      <main
        className="flex flex-1 items-center justify-center px-4 pb-16 outline-none"
        id="main"
        tabIndex={-1}
      >
        <div className="flex w-full max-w-md flex-col gap-4">{children}</div>
      </main>
      {footer}
    </div>
  </div>
);

/** What a row under a door's form leads to: another page, or another card of the same door. */
type DoorRowGoesTo =
  | { to: "/shed-phone" | "/portal/join"; onClick?: never }
  | { onClick: () => void; to?: never };

const ROW =
  "hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center gap-3 p-4 text-start transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset";

/**
 * One other way in, under a door's form: what it is, one line of who it is for, and where it goes. The whole row is
 * the way in.
 */
export const DoorRow = ({
  icon: Icon,
  title,
  hint,
  ...goes
}: { icon: LucideIcon; title: string; hint: string } & DoorRowGoesTo) => {
  const inside = (
    <>
      <span className="bg-secondary text-secondary-foreground grid size-10 shrink-0 place-items-center rounded-lg">
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground text-sm">{hint}</span>
      </span>
      <ChevronRight
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </>
  );
  const handleClick = goes.onClick;
  return goes.to ? (
    <Link className={ROW} to={goes.to}>
      {inside}
    </Link>
  ) : (
    <button className={ROW} onClick={handleClick} type="button">
      {inside}
    </button>
  );
};

/** The other ways in, on one card under the form, a hairline between them. */
export const DoorLinks = ({ children }: { children: ReactNode }) => (
  <div className="surface divide-y overflow-hidden">{children}</div>
);

/** A link inside a door's card — "Forgot password?" beside the password — the same on every door. */
export const DOOR_LINK =
  "text-primary focus-visible:ring-ring rounded-sm text-sm outline-none hover:underline focus-visible:ring-2";

/** A one-time code typed from a paper or a screen: letters and digits, spaced so each can be checked. The same field on
 *  every door that asks for one, and as tall at every width. */
export const CODE_FIELD =
  "h-14 text-center font-mono text-2xl tracking-[0.2em] uppercase md:h-14 md:text-2xl";

/**
 * The way back to signing in, at the foot of a door's card, the same on every door: a muted link with its chevron, big
 * enough for a thumb. To another page, or back to the sign-in card of the same page.
 */
export const BackToSignIn = ({
  children,
  ...goes
}: { children: ReactNode } & (
  | { to: "/sign-in" | "/portal/sign-in"; onClick?: never }
  | { onClick: () => void; to?: never }
)) => {
  const className =
    "text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center justify-center gap-1 self-center rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2";
  const handleClick = goes.onClick;
  return goes.to ? (
    <Link className={className} to={goes.to}>
      <ChevronLeft aria-hidden className="size-4" />
      {children}
    </Link>
  ) : (
    <button className={className} onClick={handleClick} type="button">
      <ChevronLeft aria-hidden className="size-4" />
      {children}
    </button>
  );
};
