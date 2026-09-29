import { ScrollText } from "lucide-react";
import type { TermixApp } from "@termix/plugin-sdk/frontend";
import { SessionLogsPanel } from "./SessionLogsPanel";
import { RecordingStatus } from "./RecordingStatus";

export function activate(app: TermixApp): void {
  // Hidden in this fork: session logs are not wanted (storage overhead).
  app.registerRailItem({
    id: "session-logs",
    icon: ScrollText,
    titleKey: "nav.sessionLogs",
    kind: "panel",
    promotable: true,
    rightDockable: true,
    separatorAfter: true,
    permission: "view",
    hidden: true,
  });

  app.registerPanel("session-logs", () => <SessionLogsPanel />);

  app.registerTab("session-logs", () => <SessionLogsPanel />, {
    icon: ScrollText,
    titleKey: "nav.sessionLogs",
    hostless: true,
  });

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
