import { api } from "@/lib/api";

const toBytes = (v) => {
  const pad = "=".repeat((4 - (v.length % 4)) % 4);
  const raw = atob((v + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome";

// Registers the service worker + push subscription. Returns true if push is active.
export async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { data } = await api.get("/push/public-key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(data.publicKey) });
  await api.post("/push/subscribe", sub.toJSON());
  return true;
}

export const saveReminders = (payload) => api.put("/reminders", { timezone: tz(), ...payload });
