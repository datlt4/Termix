/**
 * Appearance settings for the desktop app's local terminal.
 *
 * The local terminal has no host of its own, so it keeps its appearance in
 * localStorage. The User Profile's Terminal section writes here (and to the
 * user's terminal defaults), so the local terminal follows the same look as
 * every host the profile applies its settings to.
 */

import type { TerminalConfig } from "@/types";

export interface LocalTerminalSettings {
  theme?: string;
  customThemeColors?: TerminalConfig["customThemeColors"];
  fontFamily?: string;
  fontSize?: number;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
}

const STORAGE_KEY = "termix-local-terminal";

/** Fired on window whenever the local terminal settings change. */
export const LOCAL_TERMINAL_SETTINGS_CHANGED = "termix-local-terminal-changed";

export function getLocalTerminalSettings(): LocalTerminalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as LocalTerminalSettings)
      : {};
  } catch {
    return {};
  }
}

export function saveLocalTerminalSettings(value: LocalTerminalSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(
    new CustomEvent(LOCAL_TERMINAL_SETTINGS_CHANGED, { detail: value }),
  );
}

export function subscribeLocalTerminalSettings(
  callback: (value: LocalTerminalSettings) => void,
): () => void {
  const handler = () => callback(getLocalTerminalSettings());
  window.addEventListener(LOCAL_TERMINAL_SETTINGS_CHANGED, handler);
  return () =>
    window.removeEventListener(LOCAL_TERMINAL_SETTINGS_CHANGED, handler);
}
