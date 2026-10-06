import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A WebglAddon stand-in whose context loss the test can trigger.
const { addons, FakeAddon } = vi.hoisted(() => {
  const addons: InstanceType<typeof FakeAddon>[] = [];
  class FakeAddon {
    disposed = false;
    private lossHandlers: Array<() => void> = [];
    constructor() {
      addons.push(this);
    }
    onContextLoss(handler: () => void) {
      this.lossHandlers.push(handler);
    }
    loseContext() {
      for (const handler of this.lossHandlers) handler();
    }
    dispose() {
      this.disposed = true;
    }
  }
  return { addons, FakeAddon };
});
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: FakeAddon }));

import { enableFastTerminalRenderer } from "@/lib/fast-renderer";

function fakeTerminal(connected = { value: true }) {
  return {
    loaded: [] as unknown[],
    loadAddon(addon: unknown) {
      this.loaded.push(addon);
    },
    get element() {
      return { isConnected: connected.value };
    },
  };
}

beforeEach(() => {
  addons.length = 0;
  vi.useFakeTimers();
  // jsdom has no WebGL: report a working context for the one-time probe.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getExtension: () => ({ loseContext: () => {} }),
  } as never);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("enableFastTerminalRenderer", () => {
  it("re-attaches WebGL after a lost context instead of staying on DOM", () => {
    const terminal = fakeTerminal();
    expect(enableFastTerminalRenderer(terminal as never)).toBe("webgl");
    expect(addons).toHaveLength(1);

    addons[0].loseContext();
    expect(addons[0].disposed).toBe(true);
    expect(addons).toHaveLength(1); // DOM renderer until the retry fires

    vi.advanceTimersByTime(2_000);
    expect(addons).toHaveLength(2);
    expect(terminal.loaded).toContain(addons[1]);
  });

  it("backs off and gives up after repeated losses", () => {
    const terminal = fakeTerminal();
    enableFastTerminalRenderer(terminal as never);
    for (const delay of [2_000, 10_000, 30_000, 60_000, 120_000]) {
      addons[addons.length - 1].loseContext();
      vi.advanceTimersByTime(delay);
    }
    expect(addons).toHaveLength(6);
    addons[5].loseContext();
    vi.advanceTimersByTime(600_000);
    expect(addons).toHaveLength(6); // no further attempts
  });

  it("does not re-attach to a terminal that was closed", () => {
    const connected = { value: true };
    const terminal = fakeTerminal(connected);
    enableFastTerminalRenderer(terminal as never);
    addons[0].loseContext();
    connected.value = false;
    vi.advanceTimersByTime(2_000);
    expect(addons).toHaveLength(1);
  });
});
