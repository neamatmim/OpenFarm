/** Whether every one of these was typed: a form's text fields, none left blank or spaces. */
export const allTyped = (...typed: string[]): boolean =>
  typed.every((one) => one.trim() !== "");
