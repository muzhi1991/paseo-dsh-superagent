// Paseo 0.17/0.18 stores these client preferences in AsyncStorage (localStorage on web).
// A plugin's useSettings() and query cache contain only its own settings.
type SendPreferences = {
  shortcut: "enter" | "mod-enter";
  behavior: "queue" | "steer";
};
export type Delivery = SendPreferences["behavior"];
const defaults: SendPreferences = { shortcut: "enter", behavior: "steer" };

export function readSendPreferences(): SendPreferences {
  try {
    const storage = (
      globalThis as { localStorage?: { getItem(key: string): string | null } }
    ).localStorage;
    const raw =
      storage?.getItem("@paseo:app-settings") ??
      storage?.getItem("@paseo:settings");
    if (!raw) return defaults;
    const settings = JSON.parse(raw);
    return {
      shortcut: settings?.sendShortcut === "mod-enter" ? "mod-enter" : "enter",
      // DSH accepts queue and steer. A prompt must never silently cancel the active turn.
      behavior: settings?.sendBehavior === "queue" ? "queue" : "steer",
    };
  } catch {
    return defaults;
  }
}

type EnterEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
};

export function enterDelivery(
  event: EnterEvent,
  preferences: SendPreferences,
  busy: boolean,
): Delivery | undefined {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.altKey ||
    event.isComposing ||
    event.keyCode === 229
  )
    return;
  const modified = event.metaKey || event.ctrlKey;
  if (preferences.shortcut === "mod-enter" && !modified) return;
  if (busy && modified && preferences.shortcut === "enter")
    return preferences.behavior === "queue" ? "steer" : "queue";
  return busy ? preferences.behavior : "queue";
}
