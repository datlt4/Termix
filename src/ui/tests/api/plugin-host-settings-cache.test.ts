import { describe, expect, it, vi } from "vitest";

const rbacApiMock = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("@/main-axios", () => ({ rbacApi: rbacApiMock }));

import { updatePluginHostSettings } from "@/api/plugins-api";
import { getCachedSSHHosts } from "@/lib/hosts-request-cache";

describe("updatePluginHostSettings", () => {
  it("drops a host list cached before the write", async () => {
    // A host list read between the host save and this write.
    const stale = [{ id: 3, pluginSettings: { tunnels: {} } }];
    await getCachedSSHHosts(async () => stale as never);

    rbacApiMock.put.mockResolvedValue({ data: { values: {} } });
    await updatePluginHostSettings("tunnels", 3, { enableTunnel: true });

    const fresh = [
      { id: 3, pluginSettings: { tunnels: { enableTunnel: true } } },
    ];
    await expect(getCachedSSHHosts(async () => fresh as never)).resolves.toBe(
      fresh,
    );
  });
});
