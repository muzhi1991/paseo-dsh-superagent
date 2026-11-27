import { activeInstance } from "../shared/api";
import { MobileFrame } from "./mobile-frame";
import { useState, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { type PluginScreenProps, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  view,
  mutate,
  tabs,
  type Command,
  type Route,
} from "../shared/supervision";
import { Action, Notice, errorText } from "./common";
import { PanelDialog } from "./panel-dialog";
import { Router } from "./router";
import { Surface } from "./surface";
import { PageContents } from "./views";

type Confirmation = {
  title: string;
  command: Command;
  instance: string;
  after?: () => void;
};
type PanelProps = PluginScreenProps & {
  closePanel?: () => void;
  openLinkedAgent?: (id: string) => void;
};
export function Panel(props: PanelProps) {
  const resolve = useRpc(activeInstance);
  const current = useQuery({
    queryKey: ["dsh-active-instance", props.host.id],
    queryFn: () => resolve({}),
    retry: false,
  });
  return (
    <InstancePanel
      key={JSON.stringify([props.host.id, current.data])}
      {...props}
      instance={current.data}
      connectionError={current.error}
      reconnect={() => current.refetch()}
    />
  );
}
function InstancePanel(
  props: PanelProps & {
    instance?: string;
    connectionError: Error | null;
    reconnect: () => Promise<unknown>;
  },
) {
  const { theme, host } = props,
    { colors } = theme,
    windowWidth = useWindowDimensions().width;
  const [panelWidth, setPanelWidth] = useState(windowWidth),
    small = Math.min(panelWidth, windowWidth) < 680;
  const [stack, setStack] = useState<Route[]>([{ page: "概览" }]),
    [chat, setChat] = useState(false);
  const [searching, showSearch] = useState(false),
    [query, setQuery] = useState("");
  const [pending, setPending] = useState<Confirmation | null>(null),
    [busy, setBusy] = useState(false),
    lock = useRef(false);
  const drafts = useRef(new Map<string, unknown>());
  const [problem, setProblem] = useState("");
  const route = stack[stack.length - 1],
    read = useRpc(view),
    write = useRpc(mutate),
    cache = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["supervision", host.id, props.instance, route],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      read({ ...route, offset: pageParam, instance: props.instance! }),
    getNextPageParam: (last) =>
      Number.isInteger(last.data?.next_offset)
        ? (last.data.next_offset as number)
        : undefined,
    enabled: !!props.instance && !chat,
    retry: false,
    refetchInterval: route.page === "设置" ? false : 10000,
  });
  const result = q.data?.pages[0],
    items =
      q.data?.pages
        .filter((p) => p.instance === result?.instance)
        .flatMap((p) => p.data?.items || []) || [];
  const navigate = (next: Route) => {
    setProblem("");
    setStack((s) => [...s, next]);
  };
  const select = (next: Route) => {
    setProblem("");
    setStack((s) => [...s.slice(0, -1), next]);
  };
  const selected = [...stack]
    .reverse()
    .find((r) => tabs.some((t) => t === r.page))?.page;
  function search() {
    if (query.trim()) {
      if (route.page === "搜索") select({ page: "搜索", query: query.trim() });
      else navigate({ page: "搜索", query: query.trim() });
      showSearch(false);
    }
  }
  const confirm = (title: string, command: Command, after?: () => void) => {
    if (result)
      setPending({ title, command, after, instance: result.instance });
  };
  async function apply() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setProblem("");
    try {
      await write({ instance: pending.instance, command: pending.command });
      pending.after?.();
      await cache.invalidateQueries({ queryKey: ["supervision", host.id] });
    } catch (e) {
      setProblem(errorText(e));
      await q.refetch();
    } finally {
      setPending(null);
      lock.current = false;
      setBusy(false);
    }
  }
  const sessionBack = useRef<(() => void) | null>(null);
  const returnToPanel = () => setChat(false);
  const conversation = chat && (
    <Router
      {...props}
      embeddedBack={props.closePanel ? sessionBack : undefined}
      expected={props.instance}
      back={returnToPanel}
    />
  );
  if (chat && !props.closePanel) return conversation;
  const field = (
    <TextInput
      editable={!!props.instance}
      autoFocus={small && searching}
      accessibilityLabel="搜索工单、线程或触发"
      placeholder="搜索工单、线程或触发"
      placeholderTextColor={colors.foregroundMuted}
      value={query}
      onChangeText={setQuery}
      onSubmitEditing={search}
      returnKeyType="search"
      maxLength={512}
      style={{
        flex: 1,
        maxWidth: small ? undefined : 290,
        color: colors.foreground,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 7,
        paddingHorizontal: 10,
        minHeight: 34,
        fontSize: 13,
      }}
    />
  );
  const content = (
    <Surface.Provider
      value={{
        theme,
        hostId: host.id,
        compact: small,
        fullscreen: !!props.closePanel,
        instance: result?.instance,
        drafts: drafts.current,
        go: navigate,
        confirm,
      }}
    >
      <View
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
        style={{ flex: 1, backgroundColor: colors.surface0 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            width: "100%",
            maxWidth: 960,
            alignSelf: "center",
            paddingHorizontal: small ? 12 : 24,
            paddingTop: props.closePanel ? 0 : small ? 5 : 18,
            minHeight: props.closePanel ? 54 : undefined,
          }}
        >
          {props.closePanel && (
            <Action theme={theme} label="返回 Paseo" onPress={props.closePanel}>
              <Icon name="ArrowLeft" size={20} color={colors.foreground} />
            </Action>
          )}
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.foreground,
              fontWeight: "600",
              fontSize: props.closePanel ? 16 : 15,
            }}
          >
            {props.closePanel ? "DSH Superagent" : "Superagent"}
          </Text>
          {chat ? (
            <Action
              theme={theme}
              onPress={returnToPanel}
              label="返回 Superagent"
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Icon name="CornerUpLeft" size={15} color={colors.foreground} />
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 13,
                    fontWeight: "500",
                  }}
                >
                  返回面板
                </Text>
              </View>
            </Action>
          ) : (
            <>
              {small ? (
                <Action
                  theme={theme}
                  disabled={!props.instance}
                  label="搜索"
                  onPress={() => showSearch(!searching)}
                >
                  <Icon
                    name="Search"
                    size={17}
                    color={colors.foregroundMuted}
                  />
                </Action>
              ) : (
                field
              )}
              <Action
                theme={theme}
                disabled={!props.instance}
                onPress={() => setChat(true)}
              >
                主 Session ↗
              </Action>
            </>
          )}
        </View>
        {conversation}
        <View
          style={{
            display: chat ? "none" : "flex",
            flex: 1,
            width: "100%",
            maxWidth: 960,
            alignSelf: "center",
            paddingHorizontal: small ? 12 : 24,
          }}
        >
          {searching && small && (
            <View style={{ flexDirection: "row", gap: 5 }}>
              {field}
              <Action theme={theme} onPress={search}>
                搜索
              </Action>
            </View>
          )}
          <View
            style={{
              flexDirection: "row",
              borderBottomWidth: 1,
              borderColor: colors.border,
              marginBottom: 10,
            }}
          >
            {tabs.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                disabled={!props.instance}
                accessibilityState={{ selected: t === selected, disabled: !props.instance }}
                aria-selected={t === selected}
                onPress={() => {
                  setProblem("");
                  setStack([{ page: t }]);
                  showSearch(false);
                }}
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 39,
                  paddingHorizontal: small ? 0 : 14,
                  flex: small ? 1 : undefined,
                  borderBottomWidth: 2,
                  borderColor:
                    t === selected ? colors.foreground : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color:
                      t === selected
                        ? colors.foreground
                        : colors.foregroundMuted,
                    fontWeight: t === selected ? "600" : "400",
                  }}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView
            scrollEnabled={route.page !== "设置"}
            key={JSON.stringify(route)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              route.page === "设置"
                ? { flex: 1 }
                : { paddingBottom: props.closePanel ? 0 : 24 }
            }
          >
            {stack.length > 1 && (
              <View style={{ alignItems: "flex-start" }}>
                <Action
                  theme={theme}
                  onPress={() => {
                    setProblem("");
                    setStack((s) => s.slice(0, -1));
                  }}
                >
                  {"‹ 返回" + stack[stack.length - 2].page}
                </Action>
              </View>
            )}
            <Notice
              theme={theme}
              text={
                problem ||
                (props.connectionError || q.error
                  ? errorText(props.connectionError || q.error)
                  : q.isPending
                    ? "正在读取…"
                    : "")
              }
            />
            {(props.connectionError || q.error) && (
              <Action
                theme={theme}
                onPress={async () => {
                  await props.reconnect();
                  if (props.instance) await q.refetch();
                }}
              >
                重新读取
              </Action>
            )}
            {result && (
              <PageContents
                key={result.instance}
                route={route}
                result={result}
                setRoute={select}
                more={
                  q.hasNextPage && !q.isFetchingNextPage
                    ? () => void q.fetchNextPage()
                    : undefined
                }
                items={items}
              />
            )}
            {result?.agent && (props.navigation || props.openLinkedAgent) && (
              <Action
                theme={theme}
                onPress={() =>
                  props.openLinkedAgent
                    ? props.openLinkedAgent(result.agent!)
                    : props.navigation?.openAgent({
                        serverId: host.id,
                        agentId: result.agent!,
                      })
                }
              >
                打开执行 Agent ↗
              </Action>
            )}
          </ScrollView>
        </View>
        {pending && (
          <PanelDialog
            title="确认操作"
            onClose={() => {
              if (!lock.current) setPending(null);
            }}
          >
            <Text style={{ color: colors.foreground }}>{pending.title}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <Action
                theme={theme}
                disabled={busy}
                onPress={() => setPending(null)}
              >
                取消
              </Action>
              <Action
                theme={theme}
                selected
                disabled={busy}
                onPress={() => void apply()}
              >
                {busy ? "处理中…" : "确认"}
              </Action>
            </View>
          </PanelDialog>
        )}
      </View>
    </Surface.Provider>
  );
  if (!props.closePanel) return content;
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (chat) (sessionBack.current ?? returnToPanel)();
        else props.closePanel?.();
      }}
    >
      <MobileFrame backgroundColor={colors.surface0}>{content}</MobileFrame>
    </Modal>
  );
}
