import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

import {
  buildOriginWsUrl,
  resolveConnectionOrigin,
} from "../../lib/connection-origin.js";

const win = window as unknown as Record<string, unknown>;

afterEach(() => {
  delete win.IS_ELECTRON;
  delete win.electronAPI;
});

describe("resolveConnectionOrigin", () => {
  // FORK: interactive connections are always initiated from this machine
  // (Termius-like direct connections). The linked server is used for data
  // sync only, so every resolution -- regardless of host overrides,
  // defaultRemote, or desktop settings -- is "local".
  it("always resolves to local", async () => {
    await expect(resolveConnectionOrigin({})).resolves.toBe("local");
    await expect(
      resolveConnectionOrigin({ connectionOrigin: null }),
    ).resolves.toBe("local");
    await expect(
      resolveConnectionOrigin({ connectionOrigin: "local" }),
    ).resolves.toBe("local");
    await expect(
      resolveConnectionOrigin({ connectionOrigin: "remote" }),
    ).resolves.toBe("local");
  });

  it("always resolves to local even with defaultRemote", async () => {
    await expect(
      resolveConnectionOrigin(
        { connectionOrigin: null },
        { defaultRemote: true },
      ),
    ).resolves.toBe("local");
    await expect(
      resolveConnectionOrigin(
        { connectionOrigin: "remote" },
        { defaultRemote: true },
      ),
    ).resolves.toBe("local");
  });

  it("always resolves to local in Electron with remote desktop settings", async () => {
    win.IS_ELECTRON = true;
    win.electronAPI = {
      invoke: async (channel: string) =>
        channel === "get-desktop-settings"
          ? { defaultConnectionOrigin: "remote" }
          : null,
    };
    await expect(
      resolveConnectionOrigin({ connectionOrigin: null }),
    ).resolves.toBe("local");
    await expect(
      resolveConnectionOrigin({ connectionOrigin: "remote" }),
    ).resolves.toBe("local");
  });

  it("always resolves to local when the desktop settings lookup fails", async () => {
    win.IS_ELECTRON = true;
    win.electronAPI = {
      invoke: async () => {
        throw new Error("ipc failed");
      },
    };
    await expect(
      resolveConnectionOrigin({ connectionOrigin: null }),
    ).resolves.toBe("local");
  });
});

/**
 * The embedded backend authenticates a local WebSocket from its subprotocol,
 * because the browser WebSocket API cannot set an Authorization header.
 *
 * FORK: "remote" was retired -- every interactive channel dials the embedded
 * local backend, even when a caller still passes origin "remote".
 */
describe("buildOriginWsUrl", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    store.jwt = "local-jwt";
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carries the local JWT by default", async () => {
    // Every interactive channel on the embedded backend relies on this.
    const target = await buildOriginWsUrl({
      origin: "local",
      localPort: 30001,
      localPath: "/plugin-ws/docker/console",
      remotePath: "/plugin-ws/docker/console",
    });

    expect(target).toEqual({
      url: "ws://127.0.0.1:30001/plugin-ws/docker/console",
      protocols: ["termix.jwt.local-jwt"],
    });
  });

  it("omits it only when a caller asks", async () => {
    const target = await buildOriginWsUrl({
      origin: "local",
      localPort: 30001,
      localPath: "/plugin-ws/docker/console",
      remotePath: "/plugin-ws/docker/console",
      includeJwt: false,
    });

    expect(target).toEqual({
      url: "ws://127.0.0.1:30001/plugin-ws/docker/console",
      protocols: [],
    });
  });

  it("still targets the local backend when a caller passes remote", async () => {
    const target = await buildOriginWsUrl({
      origin: "remote",
      localPort: 30001,
      localPath: "/plugin-ws/remote-desktop/display",
      remotePath: "/plugin-ws/remote-desktop/display",
      includeJwt: false,
    });

    expect(target).toEqual({
      url: "ws://127.0.0.1:30001/plugin-ws/remote-desktop/display",
      protocols: [],
    });
  });

  it("leaves the URL alone when there is no token stored", async () => {
    delete store.jwt;

    const target = await buildOriginWsUrl({
      origin: "local",
      localPort: 30001,
      localPath: "/plugin-ws/ssh-terminal/terminal",
      remotePath: "/plugin-ws/ssh-terminal/terminal",
    });

    expect(target).toEqual({
      url: "ws://127.0.0.1:30001/plugin-ws/ssh-terminal/terminal",
      protocols: [],
    });
  });
});
