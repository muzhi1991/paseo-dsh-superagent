import { useEffect, useRef, useState } from "react";
import type {
  PluginClientContext,
  PluginSidebarItemProps,
  PluginScreenProps,
} from "@getpaseo/plugin/client";
import { LiveClient, useStream } from "./client/live";
import { sidebarCounts, type SidebarSnapshot } from "./shared/api";
import { SidebarCounts } from "./client/sidebar-counts";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Panel } from "./client/panel";
import { ConnectionSettings } from "./client/settings";

function Sidebar(props: PluginSidebarItemProps) {
  const { currentScreen, openScreen, layout } = props;
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const counts = useStream<
    typeof sidebarCounts.input,
    typeof sidebarCounts.event,
    SidebarSnapshot
  >(sidebarCounts, {}, !open, (_, value) => value);
  const status = !counts.error && counts.data;

  return (
    <>
      <SidebarRow
        icon="Hammer"
        trailing={
          status && (status.running > 0 || status.needsAttention > 0) ? (
            <SidebarCounts {...status} theme={props.theme} />
          ) : undefined
        }
        active={open || currentScreen?.screenId === "superagent"}
        onPress={() =>
          layout.compact
            ? setOpen(true)
            : openScreen({ screenId: "superagent" })
        }
      />
      {open && (
        <Panel
          {...props}
          params={{}}
          closePanel={close}
          openLinkedAgent={(agentId) => {
            close();
            openScreen({ screenId: "superagent", params: { agentId } });
          }}
        />
      )}
    </>
  );
}

// Agent navigation is supplied to registered screens, including when entered from the sidebar panel.
function PanelScreen(props: PluginScreenProps) {
  const opened = useRef<string | undefined>(undefined);
  const agentId = props.params.agentId;
  useEffect(() => {
    if (agentId && opened.current !== agentId && props.navigation) {
      opened.current = agentId;
      props.navigation.openAgent({ serverId: props.host.id, agentId });
    }
  }, [agentId, props.host.id, props.navigation]);
  return <Panel {...props} />;
}
export default function contribute(client: PluginClientContext) {
  client.addScreen({
    id: "superagent",
    title: "DSH Superagent",
    Component: (props) => (
      <LiveClient.Provider value={client}>
        <PanelScreen key={props.host.id} {...props} />
      </LiveClient.Provider>
    ),
  });
  client.addSidebarHeaderItem({
    id: "superagent",
    title: "DSH Superagent",
    Component: (props) => (
      <LiveClient.Provider value={client}>
        <Sidebar key={props.host.id} {...props} />
      </LiveClient.Provider>
    ),
  });
  client.addSettingsScreen({
    id: "connection",
    title: "DSH 实例",
    icon: "Plug",
    Component: (props) => (
      <LiveClient.Provider value={client}>
        <ConnectionSettings key={props.host.id} {...props} />
      </LiveClient.Provider>
    ),
  });
  return () => {};
}
