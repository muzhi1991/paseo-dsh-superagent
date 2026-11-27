import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { type PluginScreenProps, useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  view,
  mutate,
  tabs,
  type Command,
  type Route,
} from "../shared/supervision";
import { Action, Notice, errorText } from "./common";
import { Router } from "./router";
import { Surface } from "./surface";
import { PageContents } from "./views";

type Confirmation = {
  title: string;
  command: Command;
  instance: string;
  after?: () => void;
};
export function Panel(props: PluginScreenProps) {
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
  const [problem, setProblem] = useState("");
  const route = stack[stack.length - 1],
    read = useRpc(view),
    write = useRpc(mutate),
    cache = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["supervision", host.id, route],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => read({ ...route, offset: pageParam }),
    getNextPageParam: (last) =>
      Number.isInteger(last.data?.next_offset)
        ? (last.data.next_offset as number)
        : undefined,
    enabled: !chat,
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
  if (chat)
    return (
      <Router
        {...props}
        expected={result?.instance}
        back={() => setChat(false)}
      />
    );
  const field = (
    <TextInput
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
  return (
    <Surface.Provider value={{ theme, compact: small, go: navigate, confirm }}>
      <View
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
        style={{ flex: 1, backgroundColor: colors.surface0 }}
      >
        <View
          style={{
            flex: 1,
            width: "100%",
            maxWidth: 960,
            alignSelf: "center",
            paddingHorizontal: small ? 12 : 24,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingTop: small ? 5 : 18,
            }}
          >
            <Text
              style={{
                flex: 1,
                color: colors.foreground,
                fontWeight: "600",
                fontSize: 15,
              }}
            >
              Superagent
            </Text>
            {small ? (
              <Action
                theme={theme}
                label="搜索"
                onPress={() => showSearch(!searching)}
              >
                <Icon name="Search" size={17} color={colors.foregroundMuted} />
              </Action>
            ) : (
              field
            )}
            <Action theme={theme} onPress={() => setChat(true)}>
              主 Session ↗
            </Action>
          </View>
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
                accessibilityState={{ selected: t === selected }}
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
            key={JSON.stringify(route)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
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
                (q.error ? errorText(q.error) : q.isPending ? "正在读取…" : "")
              }
            />
            {q.error && (
              <Action theme={theme} onPress={() => void q.refetch()}>
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
            {result?.agent && props.navigation && (
              <Action
                theme={theme}
                onPress={() =>
                  props.navigation?.openAgent({
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
          <Modal
            title="确认操作"
            open
            onOpenChange={(open) => {
              if (!open && !lock.current) setPending(null);
            }}
          >
            <Modal.Content>
              <Text style={{ color: colors.foreground }}>{pending.title}</Text>
              <View
                style={{ flexDirection: "row", justifyContent: "flex-end" }}
              >
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
            </Modal.Content>
          </Modal>
        )}
      </View>
    </Surface.Provider>
  );
}
