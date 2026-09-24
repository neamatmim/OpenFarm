/** A digit as either script writes it: an NID or an account number may have been typed in Bangla. */
const DIGIT = /[0-9০-৯]/u;

/**
 * A number shown on a screen somebody may be looking over: every digit but the last few hidden, and everything else —
 * spaces, dashes, the bank's name and branch — left as typed, so an Investor still knows which account it is and can
 * tell the farm's copy is theirs. Text with no more digits than are shown comes back as it was.
 */
export const maskedDigits = (text: string, shown = 4): string => {
  const digits = [...text].filter((one) => DIGIT.test(one)).length;
  let seen = 0;
  return [...text]
    .map((one) => {
      if (!DIGIT.test(one)) {
        return one;
      }
      seen += 1;
      return seen > digits - shown ? one : "•";
    })
    .join("");
};
