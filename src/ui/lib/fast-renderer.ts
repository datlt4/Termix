import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";

/**
 * GPU-accelerated renderer selection for xterm.js terminals.
 *
 * xterm 6.0 ships only the DOM renderer, which renders one <span> per cell.
 * That is the dominant cost when scrolling through long scrollback or when
 * large output streams in, and it is the main reason Termix terminals feel
 * heavier than native clients. The @xterm/addon-webgl addon (built for the
 * same xterm 6 line) replaces the renderer with a WebGL2 one, which draws
 * the whole viewport in a handful of GPU passes.
 *
 * The addon is loaded best-effort: if WebGL2 is unavailable (very old GPUs,
 * some headless/remote desktop setups) or activation throws, we silently
 * keep the DOM renderer. If the GPU context is lost later (driver crash,
 * GPU reset, power saving), the addon is disposed which restores the DOM
 * renderer automatically.
 */

const STORAGE_KEY = "terminal_renderer_preference";

export type TerminalRendererPreference = "auto" | "dom" | "webgl";

export function getTerminalRendererPreference(): TerminalRendererPreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "dom" || value === "webgl" || value === "auto") {
      return value;
    }
  } catch {
    // storage unavailable (private mode, SSR) — fall through
  }
  return "auto";
}

export function setTerminalRendererPreference(
  preference: TerminalRendererPreference,
): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // ignore
  }
}

function webgl2Available(): boolean {
  try {
    const probe = document.createElement("canvas");
    return probe.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

/**
 * Enable the WebGL renderer for an already created terminal. Safe to call
 * either before or after `terminal.open()` (the addon defers activation
 * via onWillOpen when the terminal is not open yet).
 *
 * @returns which renderer the terminal will use.
 */
export function enableFastTerminalRenderer(
  terminal: Terminal,
): "webgl" | "dom" {
  const preference = getTerminalRendererPreference();
  if (preference === "dom" || !webgl2Available()) {
    return "dom";
  }

  try {
    const addon = new WebglAddon({ customGlyphs: true });
    terminal.loadAddon(addon);
    if (preference === "auto") {
      // In auto mode a lost GPU context is treated as "webgl is not viable
      // on this machine" and we permanently fall back to the DOM renderer
      // for the life of this terminal. Disposing the addon restores the
      // default renderer.
      addon.onContextLoss(() => {
        try {
          addon.dispose();
        } catch {
          // already disposed
        }
        console.warn(
          "[termix] WebGL context lost — falling back to the DOM renderer",
        );
      });
    }
    return "webgl";
  } catch (error) {
    console.warn(
      "[termix] WebGL renderer could not be loaded, using the DOM renderer:",
      error,
    );
    return "dom";
  }
}
