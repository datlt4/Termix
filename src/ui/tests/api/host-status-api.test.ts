import { beforeEach, describe, expect, it, vi } from "vitest";

const remoteCoreApiMock = vi.hoisted(() => ({ get: vi.fn() }));
const sshHostApiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/main-axios", () => ({
  sshHostApi: sshHostApiMock,
  getRemoteCoreApi: () => remoteCoreApiMock,
  isElectron: () => true,
  handleApiError: vi.fn(),
}));

import {
  getAllServerStatuses,
  refreshServerPolling,
  updateStatusCheckSettings,
} from "@/api/host-status-api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("host status checks (switched off)", () => {
  it("returns no statuses without asking the backend or the server", async () => {
    await expect(getAllServerStatuses()).resolves.toEqual({});

    // Any /status call would make the backend start probing every host.
    expect(sshHostApiMock.get).not.toHaveBeenCalled();
    expect(remoteCoreApiMock.get).not.toHaveBeenCalled();
  });
});

describe("status check routes", () => {
  it("restarts checks through core", async () => {
    sshHostApiMock.post.mockResolvedValue({ data: {} });
    await refreshServerPolling();
    expect(sshHostApiMock.post).toHaveBeenCalledWith("/status/refresh");
  });

  it("saves the default interval", async () => {
    sshHostApiMock.put.mockResolvedValue({ data: {} });
    await updateStatusCheckSettings({ statusCheckInterval: 45 });
    expect(sshHostApiMock.put).toHaveBeenCalledWith("/status/settings", {
      statusCheckInterval: 45,
    });
  });
});
