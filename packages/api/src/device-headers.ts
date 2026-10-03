// The headers a Shed Phone's requests carry, apart from everything that reads them: the browser imports these names,
// and a module with nothing else in it brings nothing else into the phone's download — no schema, no database.

/** The enrolled Shed Phone's own token. */
export const DEVICE_TOKEN_HEADER = "x-openfarm-device";
/** The token of whoever is switched in on it by PIN. */
export const SWITCH_TOKEN_HEADER = "x-openfarm-switch";
