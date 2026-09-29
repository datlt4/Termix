import type { TermixApp } from "@termix/plugin-sdk/frontend";
import { RecordingStatus } from "./RecordingStatus";

export function activate(app: TermixApp): void {
  // This fork removes the session-logs surface entirely (rail item, right-dock
  // panel and tab). The panel polled its list endpoint on every mount and
  // spammed "failed to load session logs" toasts, and the logs are not wanted
  // (storage overhead). Nothing registers the view anymore, so nothing can
  // ever load it.
  //
  // The per-host recording indicator stays: it is opt-in, purely cosmetic and
  // makes no requests.

  app.registerSlotContribution("terminal.toolbarStatus", {
    actionId: "session-recording.terminalStatus",
    titleKey: "nav.sessionLogs",
    kind: "component",
    component: RecordingStatus,
    when: (context) => {
      const host = context.host as
        | { pluginSettings?: Record<string, Record<string, unknown>> }
        | undefined;
      const enabled =
        host?.pluginSettings?.["session-recording"]?.enableSessionRecording;
      // Mirrors the backend default: recording is opt-in only.
      return enabled === true;
    },
  });
}

export function deactivate(): void {}
