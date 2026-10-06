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
 * GPU reset, power saving), the addon is disposed (the DOM renderer takes
 * over) and WebGL is re-attached after a backoff.
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

let webgl2Support: boolean | null = null;

// Probed once per page. Each probe used to leave a live WebGL2 context
// behind (one per terminal opened); Chromium keeps at most 16 and drops the
// oldest — which can be a terminal's.
function webgl2Available(): boolean {
  if (webgl2Support !== null) return webgl2Support;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    webgl2Support = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2Support = false;
  }
  return webgl2Support;
}

// Delays before re-attaching WebGL after a lost context. A lost context is
// usually transient (GPU reset, e.g. on display sleep/wake with the NVIDIA
// driver) and the DOM renderer it used to fall back to for good rebuilds
// every row element on each redraw: a busy session then produced tens of
// thousands of garbage nodes per minute and the renderer eventually ran out
// of memory.
const WEBGL_RETRY_DELAYS_MS = [2_000, 10_000, 30_000, 60_000, 120_000];
// An addon that survives this long resets the retry budget.
const WEBGL_STABLE_MS = 10 * 60_000;

function attachWebgl(terminal: Terminal, attempt: number): boolean {
  let addon: WebglAddon;
  try {
    addon = new WebglAddon({ customGlyphs: true });
    terminal.loadAddon(addon);
  } catch (error) {
    console.warn(
      "[termix] WebGL renderer could not be loaded, using the DOM renderer:",
      error,
    );
    return false;
  }
  const loadedAt = Date.now();
  addon.onContextLoss(() => {
    try {
      addon.dispose(); // restores the DOM renderer meanwhile
    } catch {
      // already disposed
    }
    // `attempt` = retries already spent on this streak of losses.
    const spent = Date.now() - loadedAt >= WEBGL_STABLE_MS ? 0 : attempt;
    const delay = WEBGL_RETRY_DELAYS_MS[spent];
    if (delay === undefined) {
      console.warn(
        "[termix] WebGL context keeps getting lost — staying on the DOM renderer",
      );
      return;
    }
    console.warn(
      `[termix] WebGL context lost — DOM renderer for now, retrying WebGL in ${delay / 1000}s`,
    );
    setTimeout(() => {
      // The terminal may have been closed meanwhile.
      if (!terminal.element?.isConnected) return;
      attachWebgl(terminal, spent + 1);
    }, delay);
  });
  return true;
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

  return attachWebgl(terminal, 0) ? "webgl" : "dom";
}
