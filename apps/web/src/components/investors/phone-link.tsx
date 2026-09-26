/** Everything in a phone number a dialler does not dial: spaces, dashes, brackets. */
const NOT_DIALLED = /[^\d+]/gu;

/** A number to ring from the phone the page is open on, or nothing where none was given — so the Detail
 *  it stands in still says so in words. */
export const phoneLink = (phone: string | null | undefined) =>
  phone ? (
    <a
      className="tabular-nums underline-offset-4 hover:underline focus-visible:underline"
      href={`tel:${phone.replaceAll(NOT_DIALLED, "")}`}
    >
      {phone}
    </a>
  ) : null;
