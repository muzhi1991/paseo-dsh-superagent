import { useRef, useState } from "react";
import { Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import type { RpcOutput } from "@getpaseo/plugin";
import * as api from "../shared/api";
import { Action, errorText, Notice } from "./common";
import { pickFiles } from "./web";

type History = RpcOutput<typeof api.history>;
type Selection = RpcOutput<typeof api.models>[number];
function requestId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (k) => {
    const n = Math.floor(Math.random() * 16);
    return (k === "x" ? n : (n & 3) | 8).toString(16);
  });
}
export function Router({
  theme,
  host,
  expected,
  back,
}: PluginScreenProps & { expected?: string; back: () => void }) {
  const history = useRpc(api.history),
    send = useRpc(api.send),
    stop = useRpc(api.cancel),
    catalog = useRpc(api.models),
    select = useRpc(api.selectModel),
    upload = useRpc(api.upload);
  const q = useQuery({
    queryKey: ["dsh-router", host.id, expected],
    queryFn: () => history({}),
    refetchInterval: 3500,
    retry: false,
  });
  const firstInstance = useRef(expected);
  if (!firstInstance.current && q.data) firstInstance.current = q.data.instance;
  const instance = firstInstance.current || "",
    changed = !!q.data && q.data.instance !== instance;
  const [draft, setDraft] = useState(""),
    [files, setFiles] = useState<{ name: string; id: string }[]>([]),
    [error, report] = useState(""),
    [pending, setPending] = useState(false);
  const [old, setOld] = useState<History[]>([]),
    [choices, setChoices] = useState<Selection[]>([]),
    [chosen, setChosen] = useState<Selection | null>(null);
  const lock = useRef(false),
    retry = useRef({ key: "", id: "" }),
    log = useRef<ScrollView>(null),
    following = useRef(true);
  const disabled = pending || changed || !q.data || !!q.error;
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    report("");
    try {
      await fn();
    } catch (e) {
      report(errorText(e));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const data = q.data,
    color = theme.colors.foreground,
    muted = theme.colors.foregroundMuted;
  const pages = [...old, ...(data ? [data] : [])],
    entries = [
      ...new Map(
        pages.flatMap((p) => p.entries.map((e) => [e.seq, e] as const)),
      ).values(),
    ].sort((a, b) => a.seq - b.seq);
  async function submit() {
    const receipts = files.map((f) => f.id),
      key = JSON.stringify([instance, draft, receipts]);
    if (retry.current.key !== key) retry.current = { key, id: requestId() };
    if (
      !(await send({
        instance,
        requestId: retry.current.id,
        text: draft,
        receipts,
      }))
    )
      throw Error("DSH 未确认接收，请重试");
    retry.current = { key: "", id: "" };
    setDraft("");
    setFiles([]);
    following.current = true;
    await q.refetch();
  }
  async function choose(m: Selection, effort?: string) {
    await select({
      instance,
      provider: m.provider,
      model: m.model,
      reasoningEffort: effort,
    });
    setChoices([]);
    setChosen(null);
    await q.refetch();
  }
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.surface0,
        paddingHorizontal: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Action theme={theme} onPress={back}>
          ‹ 返回
        </Action>
        <Text style={{ color, fontWeight: "600" }}>Router · 主 Session</Text>
      </View>
      <Notice
        theme={theme}
        text={
          changed
            ? "实例已切换，请返回再打开主会话"
            : error || errorText(q.error || "")
        }
      />
      <ScrollView
        ref={log}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const n = e.nativeEvent;
          following.current =
            n.contentOffset.y + n.layoutMeasurement.height >=
            n.contentSize.height - 45;
        }}
        scrollEventThrottle={80}
        onContentSizeChange={() => {
          if (following.current) log.current?.scrollToEnd({ animated: false });
        }}
      >
        {pages[0]?.older && (
          <Action
            theme={theme}
            disabled={disabled}
            onPress={() =>
              run(async () => {
                following.current = false;
                const p = await history({ before: pages[0].older });
                if (p.instance === instance) setOld([p, ...old]);
              })
            }
          >
            更早的消息
          </Action>
        )}
        {!changed &&
          entries.map((e) => (
            <View
              key={e.seq}
              style={{
                alignSelf: e.role === "user" ? "flex-end" : "stretch",
                maxWidth: e.role === "user" ? "90%" : "100%",
                backgroundColor:
                  e.role === "user" ? theme.colors.surface2 : "transparent",
                borderRadius: 10,
                padding: e.role === "status" ? 3 : 10,
                marginVertical: 2,
              }}
            >
              {e.role === "assistant" && (
                <Text style={{ fontWeight: "600", fontSize: 12, color: muted }}>
                  Router
                </Text>
              )}
              <Text
                selectable
                style={{
                  color: e.role === "status" ? muted : color,
                  fontSize: e.role === "status" ? 12 : 15,
                }}
              >
                {e.text}
              </Text>
            </View>
          ))}
      </ScrollView>
      {choices.length > 0 && (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 200, backgroundColor: theme.colors.surface1 }}
        >
          {chosen ? (
            <>
              {[{ id: "", name: "默认" }, ...chosen.efforts].map((e) => (
                <Action
                  key={e.id}
                  theme={theme}
                  onPress={() => run(() => choose(chosen, e.id || undefined))}
                >
                  {e.name}
                </Action>
              ))}
            </>
          ) : (
            choices.map((m) => (
              <Action
                key={m.provider + "/" + m.model}
                theme={theme}
                onPress={() =>
                  m.efforts.length ? setChosen(m) : run(() => choose(m))
                }
              >
                {m.label}
              </Action>
            ))
          )}
        </ScrollView>
      )}
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.colors.surface2,
          borderRadius: 13,
          padding: 6,
          marginVertical: 6,
        }}
      >
        {files.map((f) => (
          <Action
            key={f.id}
            disabled={pending}
            theme={theme}
            onPress={() => setFiles(files.filter((x) => x.id !== f.id))}
          >
            {f.name + " ×"}
          </Action>
        ))}
        <TextInput
          multiline
          editable={!pending && !changed}
          accessibilityLabel="给 Router 发送消息"
          placeholder="给 Router 发送消息…"
          placeholderTextColor={muted}
          value={draft}
          onChangeText={setDraft}
          style={{ color, minHeight: 42, maxHeight: 100, padding: 6 }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {Platform.OS === "web" && (
            <Action
              theme={theme}
              disabled={disabled}
              label="添加文件"
              onPress={() =>
                run(async () => {
                  for (const f of await pickFiles()) {
                    const id = await upload({ instance, ...f });
                    setFiles((prev) => [...prev, { name: f.name, id }]);
                  }
                })
              }
            >
              <Icon name="Paperclip" size={19} color={color} />
            </Action>
          )}
          <Action
            theme={theme}
            disabled={disabled}
            onPress={() =>
              run(async () => {
                setChosen(null);
                setChoices(choices.length ? [] : await catalog({ instance }));
              })
            }
          >
            {data?.model || "模型"}
          </Action>
          <View style={{ flex: 1 }} />
          {data?.busy && (
            <Action
              theme={theme}
              disabled={disabled}
              onPress={() =>
                run(async () => {
                  await stop({ instance });
                  await q.refetch();
                })
              }
            >
              停止本轮
            </Action>
          )}
          <Action
            theme={theme}
            disabled={disabled || (!draft.trim() && !files.length)}
            selected
            onPress={() => run(submit)}
          >
            {data?.busy ? "排队发送" : "发送"}
          </Action>
        </View>
      </View>
    </View>
  );
}
