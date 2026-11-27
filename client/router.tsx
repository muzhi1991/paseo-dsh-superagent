import {
  useImperativeHandle,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Modal as NativeModal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import type { RpcOutput } from "@getpaseo/plugin";
import * as api from "../shared/api";
import { Action, errorText, Notice } from "./common";
import { pickFiles } from "./web";

import {
  transcript,
  groupTurns,
  type TranscriptEvent,
} from "../shared/transcript";
import { ChatContext, compactNumber, TurnView } from "./turn";

type History = RpcOutput<typeof transcript>;
type Window = { instance: string; events: TranscriptEvent[]; older?: number };
function merge(current: Window | null, page: History, prepend = false): Window {
  const first = page.events[0]?.seq,
    last = current?.events.at(-1)?.seq;
  if (
    !current ||
    current.instance !== page.instance ||
    !current.events.length ||
    (first !== undefined &&
      last !== undefined &&
      first > last &&
      page.older !== undefined &&
      page.older > last + 1)
  )
    return page;
  const rows = new Map(current.events.map((e) => [e.seq, e]));
  for (const e of page.events) rows.set(e.seq, e);
  return {
    instance: page.instance,
    events: [...rows.values()].sort((a, b) => a.seq - b.seq),
    older:
      prepend || (first !== undefined && first <= current.events[0].seq)
        ? page.older
        : current.older,
  };
}
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
  embeddedBack,
  layout,
  back,
}: PluginScreenProps & {
  expected?: string;
  embeddedBack?: Ref<() => void>;
  back: () => void;
}) {
  const history = useRpc(transcript),
    send = useRpc(api.send),
    stop = useRpc(api.cancel),
    catalog = useRpc(api.models),
    select = useRpc(api.selectModel),
    upload = useRpc(api.upload);
  const firstInstance = useRef(expected);
  const q = useQuery({
    queryKey: ["dsh-router-transcript", host.id, expected],
    queryFn: () => history({ instance: firstInstance.current }),
    refetchInterval: 3500,
    retry: false,
  });
  if (!firstInstance.current && q.data) firstInstance.current = q.data.instance;
  const instance = firstInstance.current || "",
    changed = !!q.data && q.data.instance !== instance;
  const [draft, setDraft] = useState(""),
    [files, setFiles] = useState<{ name: string; id: string }[]>([]),
    [error, report] = useState(""),
    [pending, setPending] = useState(false);
  const [window, setWindow] = useState<Window | null>(null),
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
  useEffect(() => {
    if (data) setWindow((w) => merge(w, data));
  }, [data]);
  const visible = window ?? data;
  const [positioned, setPositioned] = useState(false);
  const turns = useMemo(
    () => groupTurns(visible?.events || []),
    [visible?.events],
  );
  const latestSeq = visible?.events.at(-1)?.seq,
    scrolledSeq = useRef<number | undefined>(undefined);
  const initialFollow = useRef(true);
  const scrollMetrics = useRef({ height: 0, y: 0 });
  const prependHeight = useRef<number | null>(null);
  function loadEarlier() {
    const before = visible?.older;
    if (before === undefined || disabled || lock.current) return;
    void run(async () => {
      initialFollow.current = false;
      following.current = false;
      const page = await history({ before, instance });
      prependHeight.current = page.events.length
        ? scrollMetrics.current.height
        : null;
      setWindow((w) => merge(w, page, true));
    });
  }
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
  const colors = theme.colors;
  const compact = layout.compact;
  const closeChoices = () => {
    setChoices([]);
    setChosen(null);
  };
  const pickerTitle = chosen ? "推理强度" : "选择模型";
  const pickerOpen = choices.length > 0;
  const handleBack = pickerOpen ? closeChoices : back;
  useImperativeHandle(embeddedBack, () => handleBack, [handleBack]);
  const pickerItems = pickerOpen && (
    <>
      {chosen
        ? [{ id: "", name: "默认" }, ...chosen.efforts].map((e) => (
            <Action
              key={e.id}
              theme={theme}
              disabled={pending}
              selected={chosen.model === data?.model && e.id === data?.effort}
              onPress={() => run(() => choose(chosen, e.id || undefined))}
            >
              {e.name}
            </Action>
          ))
        : choices.map((m) => (
            <Action
              key={m.provider + "/" + m.model}
              theme={theme}
              disabled={pending}
              selected={m.model === data?.model}
              onPress={() =>
                m.efforts.length ? setChosen(m) : run(() => choose(m))
              }
            >
              {m.label}
            </Action>
          ))}
      <Action theme={theme} onPress={closeChoices}>
        取消
      </Action>
    </>
  );
  const conversation = (
    <ChatContext.Provider value={{ theme, hostId: host.id, instance, report }}>
      <View
        style={{ flex: 1, backgroundColor: colors.surface0 }}
        accessibilityElementsHidden={compact && pickerOpen}
        importantForAccessibility={
          compact && pickerOpen ? "no-hide-descendants" : "auto"
        }
        aria-hidden={compact && pickerOpen}
      >
        {!embeddedBack && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingLeft: compact ? 16 : 24,
              paddingRight: compact ? 12 : 20,
              minHeight: 54,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            {compact && (
              <Action theme={theme} label="返回上一页" onPress={back}>
                <Icon name="ArrowLeft" size={20} color={color} />
              </Action>
            )}
            <View
              style={{
                flex: 1,
                minWidth: 0,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color,
                  fontSize: 16,
                  fontWeight: "600",
                  maxWidth: "100%",
                  flexShrink: 1,
                }}
              >
                {compact ? "DSH Superagent" : data?.title || "Router"}
              </Text>
              {!compact && (
                <Text numberOfLines={1} style={{ color: muted, fontSize: 12 }}>
                  主 Session
                </Text>
              )}
            </View>
            <Action theme={theme} onPress={back} label="返回 Superagent">
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Icon name="CornerUpLeft" size={15} color={color} />
                <Text style={{ color, fontSize: 13, fontWeight: "500" }}>
                  返回面板
                </Text>
              </View>
            </Action>
          </View>
        )}
        <Notice
          theme={theme}
          text={
            changed
              ? "实例已切换，请返回再打开主会话"
              : error || errorText(q.error || "")
          }
        />
        <ScrollView
          key={latestSeq === undefined ? "empty" : "transcript"}
          ref={log}
          style={{
            flex: 1,
            opacity: latestSeq === undefined || positioned ? 1 : 0,
          }}
          keyboardShouldPersistTaps="handled"
          onStartShouldSetResponderCapture={() => {
            initialFollow.current = false;
            return false;
          }}
          onLayout={() => {
            if (initialFollow.current && latestSeq !== undefined)
              log.current?.scrollToEnd({ animated: false });
          }}
          onScroll={(e) => {
            const n = e.nativeEvent,
              prior = scrollMetrics.current.y;
            if (prior > n.contentOffset.y) initialFollow.current = false;
            scrollMetrics.current.y = n.contentOffset.y;
            following.current =
              n.contentOffset.y + n.layoutMeasurement.height >=
              n.contentSize.height - 45;
            if (
              n.contentOffset.y < 50 &&
              prior > n.contentOffset.y &&
              !following.current
            )
              loadEarlier();
          }}
          scrollEventThrottle={80}
          onContentSizeChange={(_, height) => {
            scrollMetrics.current.height = height;
            if (prependHeight.current !== null) {
              const delta = height - prependHeight.current;
              prependHeight.current = null;
              if (delta > 0)
                log.current?.scrollTo({
                  y: scrollMetrics.current.y + delta,
                  animated: false,
                });
              return;
            }
            if (
              latestSeq !== undefined &&
              (initialFollow.current || scrolledSeq.current !== latestSeq)
            ) {
              scrolledSeq.current = latestSeq;
              if (initialFollow.current || following.current)
                log.current?.scrollToEnd({ animated: false });
              if (!positioned) setPositioned(true);
            }
          }}
          contentContainerStyle={{
            width: "100%",
            maxWidth: 716,
            alignSelf: "center",
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 14,
          }}
        >
          {visible?.older !== undefined && (
            <Action theme={theme} disabled={disabled} onPress={loadEarlier}>
              更早的消息
            </Action>
          )}
          {!changed && turns.map((t) => <TurnView key={t.id} turn={t} />)}
          {!turns.length && !q.error && (
            <Text style={{ textAlign: "center", color: muted, padding: 20 }}>
              {q.isPending ? "正在读取主会话…" : "还没有对话"}
            </Text>
          )}
        </ScrollView>

        <View
          style={{
            width: "100%",
            maxWidth: 738,
            alignSelf: "center",
            paddingHorizontal: 12,
            paddingBottom: compact ? (Platform.OS === "ios" ? 34 : 26) : 12,
            paddingTop: 4,
            gap: 7,
          }}
        >
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface1,
              borderRadius: 17,
              padding: 6,
            }}
          >
            {files.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {files.map((f) => (
                  <Action
                    key={f.id}
                    theme={theme}
                    disabled={pending}
                    label={"移除 " + f.name}
                    onPress={() =>
                      setFiles((prev) => prev.filter((x) => x.id !== f.id))
                    }
                  >
                    {f.name + " ×"}
                  </Action>
                ))}
              </View>
            )}
            <TextInput
              multiline
              editable={!pending && !changed}
              accessibilityLabel="给 Router 发送消息"
              placeholder="发送消息…"
              placeholderTextColor={muted}
              value={draft}
              onChangeText={setDraft}
              style={{
                color,
                fontSize: 15,
                minHeight: 42,
                maxHeight: 128,
                paddingHorizontal: 9,
                paddingVertical: 9,
              }}
            />
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
              {Platform.OS === "web" && (
                <Action
                  theme={theme}
                  disabled={disabled}
                  label="添加文件"
                  onPress={() =>
                    run(async () => {
                      const picked = await pickFiles();
                      if (files.length + picked.length > 12)
                        throw Error("每条消息最多 12 个附件");
                      for (const f of picked) {
                        const id = await upload({ instance, ...f });
                        setFiles((prev) => [...prev, { name: f.name, id }]);
                      }
                    })
                  }
                >
                  <Icon name="Paperclip" size={18} color={muted} />
                </Action>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="选择模型"
                disabled={disabled}
                onPress={() =>
                  run(async () => {
                    const options = await catalog({ instance });
                    if (!options.length) throw Error("DSH 尚未配置可用模型");
                    setChoices(options);
                  })
                }
                accessibilityState={{ disabled, expanded: choices.length > 0 }}
                hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 1,
                  minHeight: 34,
                  paddingHorizontal: 10,
                  borderRadius: 9,
                  backgroundColor: colors.surface2,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
                })}
              >
                <Icon name="Cpu" size={15} color={color} />
                <Text
                  numberOfLines={1}
                  style={{
                    color,
                    fontSize: 13,
                    fontWeight: "600",
                    flexShrink: 1,
                  }}
                >
                  {data?.model || "选择模型"}
                </Text>
                {!!data?.effort && (
                  <Text
                    numberOfLines={1}
                    style={{ color: muted, fontSize: 12, flexShrink: 1 }}
                  >
                    {data.effort}
                  </Text>
                )}
                <Icon name="ChevronDown" color={color} size={14} />
              </Pressable>
              <View style={{ flex: 1 }} />
              {data?.busy && (
                <Action
                  theme={theme}
                  disabled={disabled}
                  label="停止本轮"
                  onPress={() =>
                    run(async () => {
                      await stop({ instance });
                      await q.refetch();
                    })
                  }
                >
                  <Icon name="Square" size={15} color={color} />
                </Action>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={data?.busy ? "排队发送" : "发送"}
                disabled={disabled || (!draft.trim() && !files.length)}
                onPress={() => run(submit)}
                style={{
                  width: 34,
                  height: 34,
                  marginRight: 3,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.foreground,
                  opacity:
                    disabled || (!draft.trim() && !files.length) ? 0.38 : 1,
                }}
              >
                <Icon name="ArrowUp" size={19} color={colors.surface0} />
              </Pressable>
            </View>
          </View>
          {data ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 6,
                paddingHorizontal: 5,
              }}
            >
              <Text style={{ color: muted, fontSize: 11 }}>
                {data.stats.turns} 轮　{data.stats.steps} 步
                {data.stats.speed ? " · " + data.stats.speed + " tok/s" : ""}
              </Text>
              <Text style={{ color: muted, fontSize: 11 }}>
                {compactNumber(data.stats.tokens)} tok
                {data.stats.pressure === undefined
                  ? ""
                  : " · 上下文 " + data.stats.pressure + "%"}
              </Text>
            </View>
          ) : (
            <View style={{ height: 14 }} />
          )}
        </View>
      </View>
    </ChatContext.Provider>
  );
  const compactContent = (
    <>
      {conversation}
      {pickerOpen && (
        <View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <Pressable
            accessible={false}
            onPress={closeChoices}
            style={{ flex: 1 }}
          />
          <View
            style={{
              maxHeight: "80%",
              backgroundColor: colors.surface1,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                color,
                fontSize: 16,
                fontWeight: "600",
                marginBottom: 8,
              }}
            >
              {pickerTitle}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {pickerItems}
            </ScrollView>
          </View>
        </View>
      )}
    </>
  );
  if (embeddedBack) return compactContent;
  return compact ? (
    <NativeModal
      visible
      presentationStyle="fullScreen"
      onRequestClose={handleBack}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface0 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          {compactContent}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </NativeModal>
  ) : (
    <>
      {conversation}
      <Modal
        title={pickerTitle}
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open) closeChoices();
        }}
      >
        <Modal.Content>{pickerItems}</Modal.Content>
      </Modal>
    </>
  );
}
