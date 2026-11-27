import { ImageViewport } from "./image-viewport";
import { enterDelivery, readSendPreferences, type Delivery } from "./send-keys";
import { MobileFrame } from "./mobile-frame";
import {
  useImperativeHandle,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  Modal as NativeModal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import type { RpcOutput } from "@getpaseo/plugin";
import * as api from "../shared/api";
import { Action, errorText, Loading, Notice, type Theme } from "./common";
import { pickAttachments } from "./web";
import { ComposerSheet } from "./composer-sheet";
import type { AttachmentAction } from "./attachments";

import {
  transcript,
  groupTurns,
  type TranscriptEvent,
} from "../shared/transcript";
import { useOutbox, type Outgoing } from "./outbox";
import { ChatContext, compactNumber, OutgoingMessage, TurnView } from "./turn";

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
function PickerOption({
  theme,
  label,
  checked,
  disabled,
  onPress,
}: {
  theme: Theme;
  label: string;
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = theme;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        minHeight: 44,
        paddingHorizontal: 12,
        gap: 10,
        borderRadius: 8,
        backgroundColor: checked || pressed ? colors.surface2 : "transparent",
      })}
    >
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          color: colors.foreground,
          fontWeight: checked ? "600" : "400",
        }}
      >
        {label}
      </Text>
      {checked && <Icon name="Check" color={colors.foreground} size={18} />}
    </Pressable>
  );
}
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
    [inputFocused, setInputFocused] = useState(false),
    [files, setFiles] = useState<{ name: string; id: string }[]>([]),
    [error, report] = useState(""),
    [pending, setPending] = useState(false);
  const [window, setWindow] = useState<Window | null>(null),
    [menu, setMenu] = useState<"attachments" | "models" | null>(null),
    [chosen, setChosen] = useState<Selection | null>(null);
  const models = useQuery({
    queryKey: ["dsh-router-models", host.id, instance],
    queryFn: () => catalog({ instance }),
    enabled: menu === "models" && !!instance && !changed,
    retry: false,
  });
  const choices = models.data || [];
  const lock = useRef(false),
    scrollOnSend = useRef(false),
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
  const outbox = useOutbox(host.id, instance, visible?.events);
  const [positioned, setPositioned] = useState(false);
  const [images] = useState(() => new ImageViewport());
  const logHeight = useRef(0);
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
  async function deliver(message: Outgoing) {
    try {
      const accepted = await send({
        instance,
        requestId: message.id,
        mode: message.mode,
        text: message.text,
        receipts: message.files.map((f) => f.id),
      });
      if (!accepted) throw Error("DSH 未确认接收");
      outbox.status(message.id, "accepted");
    } catch (e) {
      outbox.status(message.id, "unconfirmed", errorText(e));
    }
    void q.refetch();
  }
  async function choose(m: Selection, effort?: string) {
    await select({
      instance,
      provider: m.provider,
      model: m.model,
      reasoningEffort: effort,
    });
    setMenu(null);
    setChosen(null);
    await q.refetch();
  }
  const colors = theme.colors;
  const compact = layout.compact;
  const desktopKeys = Platform.OS === "web" && !compact;
  const canSend = !disabled && (!!draft.trim() || files.length > 0);
  function sendDraft(mode: Delivery) {
    if (!canSend || lock.current) return;
    void run(() => {
      const message: Outgoing = {
        id: requestId(),
        mode,
        text: draft,
        files,
        state: "sending",
      };
      following.current = true;
      scrollOnSend.current = true;
      outbox.append(message);
      setDraft("");
      setFiles([]);
      log.current?.scrollToEnd({ animated: false });
      return deliver(message);
    });
  }
  const closeChoices = () => {
    setMenu(null);
    setChosen(null);
  };
  function openMenu(which: "attachments" | "models") {
    if (Platform.OS !== "web") Keyboard.dismiss();
    report("");
    setMenu(which);
  }
  function addAttachment(action: AttachmentAction) {
    closeChoices();
    void run(async () => {
      const picked = await pickAttachments(action, 12 - files.length);
      for (const f of picked) {
        const id = await upload({ instance, ...f });
        setFiles((prev) => [...prev, { name: f.name, id }]);
      }
    });
  }
  const attachmentItems = [
    { action: "image", label: "添加图片", icon: "Image" },
    { action: "paste", label: "粘贴图片", icon: "ClipboardPaste" },
    { action: "file", label: "上传文件", icon: "Paperclip" },
  ] as const;
  const pickerTitle =
    menu === "attachments" ? "添加附件" : chosen ? "推理强度" : "选择模型";
  const pickerOpen = menu !== null;
  const handleBack = pickerOpen ? closeChoices : back;
  useImperativeHandle(embeddedBack, () => handleBack, [handleBack]);
  const matchingModels = choices.filter(
    (m) =>
      m.model === data?.model &&
      (!data.provider || m.provider === data.provider),
  );
  const activeModel =
    matchingModels.length === 1 ? matchingModels[0] : undefined;
  const pickerItems = pickerOpen && (
    <>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={pickerTitle}
        style={{ gap: 2 }}
      >
        {chosen
          ? [{ id: "", name: "默认" }, ...chosen.efforts].map((e) => (
              <PickerOption
                key={e.id}
                theme={theme}
                label={e.name}
                disabled={pending}
                checked={
                  chosen.provider === activeModel?.provider &&
                  chosen.model === activeModel?.model &&
                  e.id === data?.effort
                }
                onPress={() => run(() => choose(chosen, e.id || undefined))}
              />
            ))
          : choices.map((m) => (
              <PickerOption
                key={m.provider + "/" + m.model}
                theme={theme}
                label={m.label}
                disabled={pending}
                checked={m === activeModel}
                onPress={() =>
                  m.efforts.length ? setChosen(m) : run(() => choose(m))
                }
              />
            ))}
      </View>
    </>
  );
  const conversation = (
    <ChatContext.Provider
      value={{ theme, hostId: host.id, instance, report, images }}
    >
      <View
        style={{ flex: 1, backgroundColor: colors.surface0 }}
        accessibilityElementsHidden={pickerOpen}
        importantForAccessibility={pickerOpen ? "no-hide-descendants" : "auto"}
        aria-hidden={pickerOpen}
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
          contentContainerStyle={q.isPending ? { flexGrow: 1 } : undefined}
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
          onLayout={(e) => {
            logHeight.current = e.nativeEvent.layout.height;
            images.layoutChanged();
            if (scrolledSeq.current !== undefined)
              images.scroll(
                initialFollow.current
                  ? scrollMetrics.current.height - logHeight.current
                  : scrollMetrics.current.y,
                logHeight.current,
              );
            if (initialFollow.current && latestSeq !== undefined)
              log.current?.scrollToEnd({ animated: false });
          }}
          onScroll={(e) => {
            const n = e.nativeEvent,
              prior = scrollMetrics.current.y;
            if (prior > n.contentOffset.y) initialFollow.current = false;
            scrollMetrics.current.y = n.contentOffset.y;
            if (scrolledSeq.current !== undefined)
              images.scroll(
                initialFollow.current
                  ? n.contentSize.height - n.layoutMeasurement.height
                  : n.contentOffset.y,
                n.layoutMeasurement.height,
              );
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
            images.layoutChanged();
            if (scrollOnSend.current) {
              scrollOnSend.current = false;
              log.current?.scrollToEnd({ animated: false });
            }
            if (prependHeight.current !== null) {
              const delta = height - prependHeight.current;
              prependHeight.current = null;
              if (delta > 0) {
                images.scroll(
                  scrollMetrics.current.y + delta,
                  logHeight.current,
                );
                log.current?.scrollTo({
                  y: scrollMetrics.current.y + delta,
                  animated: false,
                });
              }
              return;
            }
            if (
              latestSeq !== undefined &&
              (initialFollow.current || scrolledSeq.current !== latestSeq)
            ) {
              scrolledSeq.current = latestSeq;
              if (initialFollow.current || following.current) {
                images.scroll(height - logHeight.current, logHeight.current);
                log.current?.scrollToEnd({ animated: false });
              }
              if (!positioned) setPositioned(true);
            }
          }}
        >
          <View
            ref={images.setRoot}
            collapsable={false}
            onLayout={images.layoutChanged}
            style={{
              width: "100%",
              flexGrow: q.isPending ? 1 : undefined,
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
            {!changed &&
              turns.map((t) => (
                <TurnView
                  key={t.id}
                  turn={t}
                  card={data?.actionCards?.[t.id]}
                />
              ))}
            {!changed &&
              outbox.messages.map((message) => (
                <OutgoingMessage
                  key={message.id}
                  message={message}
                  disabled={disabled}
                  retry={() =>
                    void run(() => {
                      outbox.status(message.id, "sending");
                      return deliver(message);
                    })
                  }
                />
              ))}
            {q.isPending && <Loading theme={theme} />}
            {!turns.length &&
              !outbox.messages.length &&
              !q.isPending &&
              !q.error && (
                <Text
                  style={{ textAlign: "center", color: muted, padding: 20 }}
                >
                  还没有对话
                </Text>
              )}
          </View>
        </ScrollView>

        <View
          style={{
            width: "100%",
            maxWidth: 738,
            alignSelf: "center",
            paddingHorizontal: 12,
            paddingBottom: compact || embeddedBack ? 0 : 12,
            paddingTop: 4,
            gap: 7,
          }}
        >
          <View
            style={{
              borderWidth: 1,
              borderColor: inputFocused
                ? colors.foregroundMuted
                : colors.border,
              backgroundColor: colors.surface1,
              borderRadius: 18,
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
              underlineColorAndroid="transparent"
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyPress={
                desktopKeys
                  ? (e) => {
                      const key = e.nativeEvent as typeof e.nativeEvent & {
                        repeat?: boolean;
                      };
                      if (key.key !== "Enter") return;
                      const mode = enterDelivery(
                        key,
                        readSendPreferences(),
                        !!data?.busy,
                      );
                      if (!mode) return;
                      e.preventDefault();
                      if (!key.repeat) sendDraft(mode);
                    }
                  : undefined
              }
              editable={!changed}
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
                outlineWidth: 0,
                backgroundColor: "transparent",
                paddingHorizontal: 9,
                paddingVertical: 9,
              }}
            />
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
              <Action
                theme={theme}
                disabled={disabled}
                label="添加附件"
                onPress={() => openMenu("attachments")}
              >
                <Icon name="Plus" size={20} color={color} />
              </Action>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="选择模型"
                disabled={disabled}
                onPress={() => openMenu("models")}
                accessibilityState={{ disabled, expanded: menu === "models" }}
                hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 1,
                  minHeight: 34,
                  paddingHorizontal: 10,
                  borderRadius: 9,
                  backgroundColor: pressed ? colors.surface2 : "transparent",
                  opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
                })}
              >
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
                accessibilityLabel={
                  data?.busy && !desktopKeys ? "排队发送" : "发送"
                }
                disabled={!canSend}
                onPress={() =>
                  sendDraft(
                    desktopKeys && data?.busy
                      ? readSendPreferences().behavior
                      : "queue",
                  )
                }
                style={{
                  width: 34,
                  height: 34,
                  marginRight: 3,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.foreground,
                  opacity: canSend ? 1 : 0.38,
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
  const content = (
    <View style={{ flex: 1 }}>
      {conversation}
      {menu && (
        <ComposerSheet
          title={pickerTitle}
          theme={theme}
          compact={compact}
          close={closeChoices}
        >
          {menu === "attachments" ? (
            attachmentItems
              .filter(
                (item) =>
                  item.action !== "paste" || compact || Platform.OS !== "web",
              )
              .map((item) => (
                <Action
                  key={item.action}
                  theme={theme}
                  label={item.label}
                  onPress={() => addAttachment(item.action)}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      minHeight: 44,
                    }}
                  >
                    <Icon name={item.icon} size={19} color={muted} />
                    <Text style={{ color, fontSize: 15 }}>{item.label}</Text>
                  </View>
                </Action>
              ))
          ) : models.isPending ? (
            <Loading theme={theme} />
          ) : models.error ? (
            <>
              <Notice theme={theme} text={errorText(models.error)} />
              <Action theme={theme} onPress={() => void models.refetch()}>
                重试
              </Action>
            </>
          ) : !choices.length ? (
            <Notice theme={theme} text="DSH 尚未配置可用模型" />
          ) : (
            <>
              <Notice theme={theme} text={error} />
              {pickerItems}
            </>
          )}
        </ComposerSheet>
      )}
    </View>
  );
  if (embeddedBack || !compact) return content;
  return (
    <NativeModal
      visible
      presentationStyle="fullScreen"
      onRequestClose={handleBack}
    >
      <MobileFrame backgroundColor={colors.surface0}>{content}</MobileFrame>
    </NativeModal>
  );
}
