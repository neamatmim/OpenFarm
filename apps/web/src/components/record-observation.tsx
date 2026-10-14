import { useMutation } from "@tanstack/react-query";

import {
  keptOnThePhone,
  queueObservation,
  sendOrKeep,
} from "@/lib/record-offline";
import { client } from "@/utils/orpc";

/** What somebody reports seeing of an animal: which, what, and in their own words if they add any. */
export interface ObservationSaid {
  tagNumber: string;
  saw: string;
  note?: string;
}

/**
 * Recording an Observation the way every screen does: sent now when the farm answers, kept on the phone when it does
 * not — bars and no data included — and run with no signal, where React Query would park it unseen. Says which
 * happened, so the screen can say "recorded" or "kept on this phone".
 */
export const useRecordObservation = ({
  onSuccess,
  onError,
}: {
  onSuccess: (how: "sent" | "kept", said: ObservationSaid) => unknown;
  onError: (error: Error) => void;
}) =>
  useMutation({
    ...keptOnThePhone,
    mutationFn: (said: ObservationSaid) =>
      sendOrKeep({
        online: navigator.onLine,
        send: () => client.observations.record(said),
        keep: () => queueObservation(said),
      }),
    onSuccess: (how, said) => onSuccess(how, said),
    onError,
  });
