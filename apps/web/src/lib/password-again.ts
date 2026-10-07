// The farm asking for the signed-in person's password again, for an act that asks for it once a quarter hour
// (packages/api/src/password-again.ts). The request that was refused waits on the answer and is sent again once it
// is given; the dialog that asks (components/password-again-dialog.tsx) is drawn once, in the signed-in shell.

type Answer = (given: boolean) => void;

let waiting: Answer[] = [];
const listeners = new Set<() => void>();

const tell = () => {
  for (const listener of listeners) {
    listener();
  }
};

/** Asks for the password, and resolves whether it was given. Several acts refused at once share one asking. */
export const askForPassword = (): Promise<boolean> =>
  // oxlint-disable-next-line promise/avoid-new -- a person's answer in a dialog is an event, with no promise of its own
  new Promise((resolve) => {
    waiting = [...waiting, resolve];
    tell();
  });

/** The dialog's answer: given, and every act waiting on it is sent again; or not, and each is left refused. */
export const answerTheAsking = (given: boolean) => {
  const answered = waiting;
  waiting = [];
  tell();
  for (const answer of answered) {
    answer(given);
  }
};

/** Whether anything is waiting on the password, for the dialog to show itself by. */
export const isAsking = () => waiting.length > 0;

export const onAsking = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
