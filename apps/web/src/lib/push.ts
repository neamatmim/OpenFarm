/** Whether this browser can be told anything at all. An old browser, or a page that is not
 *  installed, simply cannot — and that is not an error, it is a fact about the device. */
export const canBeTold = (): boolean =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

/** What a browser calls itself to a push service. */
export interface Listener {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const asBase64 = (buffer: ArrayBuffer | null): string => {
  if (!buffer) {
    return "";
  }
  let binary = "";
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

/** The farm's public key, as the browser wants it. */
const asKeyBytes = (key: string): Uint8Array<ArrayBuffer> => {
  const padded = (key + "=".repeat((4 - (key.length % 4)) % 4))
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.codePointAt(index) ?? 0;
  }
  return bytes;
};

const asListener = (subscription: PushSubscription): Listener => ({
  endpoint: subscription.endpoint,
  p256dh: asBase64(subscription.getKey("p256dh")),
  auth: asBase64(subscription.getKey("auth")),
});

/** What this browser has already agreed to, if anything. */
export const currentListener = async (): Promise<Listener | null> => {
  if (!canBeTold()) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing ? asListener(existing) : null;
};

/**
 * Asks this browser to be told, and hands back what the farm needs to speak to it. Returns
 * null when the person says no — which is an answer, not a failure.
 */
export const askToBeTold = async (
  publicKey: string
): Promise<Listener | null> => {
  if (!canBeTold()) {
    return null;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: asKeyBytes(publicKey),
    }));
  return asListener(subscription);
};

/** Tells this browser to stop listening. */
export const stopBeingTold = async (): Promise<string | null> => {
  if (!canBeTold()) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return null;
  }
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
};
