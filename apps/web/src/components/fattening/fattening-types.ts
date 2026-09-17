import type { LucideIcon } from "lucide-react";
import {
  CircleCheck,
  CircleHelp,
  ShieldAlert,
  Store,
  TriangleAlert,
  Wheat,
} from "lucide-react";

import type { Tone } from "@/components/page";
import type { orpc } from "@/utils/orpc";

/** One animal on the fattening side, as the board answers for it. */
export type BoardRow = NonNullable<
  Awaited<ReturnType<typeof orpc.fattening.board.call>>
>[number];

/** Short of the target first, then the ones with no rate to judge, then the rest: a screen that lists everything in
 *  tag order is a screen nobody reads twice. */
export const ORDER = { behind: 0, unknown: 1, onTrack: 2 } as const;
export type Standing = keyof typeof ORDER;

export const standingOf = (onTrack: boolean | null): Standing => {
  if (onTrack === false) {
    return "behind";
  }
  return onTrack === null ? "unknown" : "onTrack";
};

export const STANDING_LOOK: Record<
  Standing,
  {
    tone: Tone;
    icon: LucideIcon;
    word: "gain.behind" | "gain.noRate" | "gain.onTrack";
  }
> = {
  behind: { tone: "warning", icon: TriangleAlert, word: "gain.behind" },
  unknown: { tone: "neutral", icon: CircleHelp, word: "gain.noRate" },
  onTrack: { tone: "success", icon: CircleCheck, word: "gain.onTrack" },
};

/** The three States of the fattening side, each with its colour and icon; a State from elsewhere reads plainly. */
const STATE_LOOK: Record<string, { tone: Tone; icon: LucideIcon }> = {
  quarantine: { tone: "warning", icon: ShieldAlert },
  fattening: { tone: "neutral", icon: Wheat },
  ready_for_sale: { tone: "success", icon: Store },
};

export const stateLookOf = (state: string): { tone: Tone; icon: LucideIcon } =>
  STATE_LOOK[state] ?? { tone: "neutral", icon: CircleHelp };

/** The gap between her two rates, said out loud: a bull whose lifetime average still looks fine may have stopped
 *  gaining a fortnight ago. */
export const isSlowing = (row: BoardRow): boolean =>
  row.recent !== null &&
  row.sinceIntake !== null &&
  row.recent.dailyGainKg < row.sinceIntake.dailyGainKg;

/** The day she is fit, when the farm refused because she is still inside her meat Withdrawal. */
export const fitOnFrom = (error: unknown): string | null => {
  const data = (error as { data?: { refusal?: string; fitOn?: string } })?.data;
  return data?.refusal === "meat_withdrawal" ? (data.fitOn ?? null) : null;
};

/** One animal the farm suggests may be sold, with the grounds it suggests her on. */
export type Suggestion = Awaited<
  ReturnType<typeof orpc.ready.suggestions.call>
>[number];
