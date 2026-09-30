import { Activity, Server } from "lucide-react";
import type {
  HomepageWidgetContribution,
  HostEditorSectionProps,
  StandaloneViewProps,
  TabProps,
  TermixApp,
} from "@termix/plugin-sdk/frontend";
import { HostMetricsTab } from "./HostMetricsTab";
import HostMetricsApp from "./HostMetricsApp";
import { HostStatsTab } from "./HostEditorStatsTab";
import { metricsChartWidget } from "./MetricsChartWidget";
import { TerminalMetricsStatus } from "./TerminalMetricsStatus";
import { createHostMetricsApi } from "./host-metrics-api";
import { createMetricsSummaryStore } from "./summary-store";

type HostMetricsTabConfig = Parameters<typeof HostMetricsTab>[0]["hostConfig"];

/**
 * Fork policy: host metrics is permanently disabled, so no host ever shows
 * the host-row button or the terminal status bar that would open it.
 */
function metricsEnabledFor(host: unknown): boolean {
  void host;
  return false;
}

function MetricsTab({ sshHost, label, isVisible }: TabProps) {
  return (
    <HostMetricsTab
      hostConfig={sshHost as unknown as HostMetricsTabConfig}
      title={label}
      isVisible={isVisible}
      isTopbarOpen={false}
      embedded={true}
    />
  );
}

function MetricsStandalone({ hostId }: StandaloneViewProps) {
  return <HostMetricsApp hostId={hostId} />;
}

function MetricsHostSection(props: HostEditorSectionProps) {
  return <HostStatsTab {...props} />;
}

export async function activate(app: TermixApp): Promise<void> {
  const allowed = await app.hasPermission("use");
  const metricsApi = createHostMetricsApi(app.api);
  const summaries = createMetricsSummaryStore(metricsApi);
  app.onDispose(() => summaries.dispose());

  // The latest disk sample, for the file manager's usage bar.
  app.registerAction(
    "host-metrics.disk",
    (async (hostId: number) =>
      (await metricsApi.getMetrics(hostId).catch(() => null))?.disk ??
      null) as never,
    { permission: "use" },
  );

  app.registerTab("host-metrics", MetricsTab, {
    icon: Server,
    titleKey: "nav.hostMetrics",
    requiresHost: true,
    noHostMessageKey: "hostMetrics.noHostSelected",
    persistent: true,
    activityTypes: ["server_stats"],
    standalone: MetricsStandalone,
    // Links copied before the rename still open.
    standaloneViews: ["server-stats"],
    preload: () => import("./HostMetricsTab"),
  });

  // Fork policy: the host-row Host Metrics button is intentionally not
  // registered, so there is nothing on the host list to press by accident.
  // The tab itself stays registered for sessions that already have it open.

  app.registerHostEditorSection({
    id: "host-metrics",
    group: "ssh",
    titleKey: "hosts.tabHostMetrics",
    icon: Activity,
    order: 70,
    component: MetricsHostSection,
  });

  app.registerHomepageWidget(
    metricsChartWidget as unknown as HomepageWidgetContribution,
  );

  // Live CPU, memory and disk bars in the terminal toolbar's expanded view.
  app.registerSlotContribution("terminal.toolbarStatus", {
    actionId: "host-metrics.terminalStatus",
    titleKey: "nav.hostMetrics",
    kind: "component",
    component: TerminalMetricsStatus,
    when: (context) => allowed && metricsEnabledFor(context.host),
  });

  // Fork policy: the dashboard and homepage metrics columns are not
  // registered either, so the outer UI shows no (permanently empty)
  // metrics columns for hosts.

  app.declareActionSlot({
    id: "host-metrics.managers",
    accepts: ["component"],
  });
}
