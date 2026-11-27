import { loadImage, type ImageViewport } from "./image-viewport";
import { PresentedFiles, ProposalCard } from "./turn-cards";
import type { ActionCard } from "../shared/cards";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { copyText, Icon, Markdown } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import {
  eventDetail,
  imageAttachment,
  type Attachment,
  type Turn,
  type TranscriptEvent,
} from "../shared/transcript";
import { errorText, type Theme } from "./common";

type ChatStyle = {
  theme: Theme;
  images: ImageViewport;
  instance: string;
  hostId: string;
  report: (message: string) => void;
};
export const ChatContext = createContext<ChatStyle | null>(null);
function useChat() {
  const c = useContext(ChatContext);
  if (!c) throw Error("缺少主会话");
  return c;
}
export function compactNumber(n: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
function clock(time: number) {
  const date = new Date(time),
    now = new Date();
  const day =
    date.toDateString() === now.toDateString()
      ? ""
      : (date.getFullYear() === now.getFullYear()
          ? ""
          : date.getFullYear() + "年") +
        (date.getMonth() + 1) +
        "月" +
        date.getDate() +
        "日 ";
  return (
    day +
    [date.getHours(), date.getMinutes()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":")
  );
}
function elapsed(ms: number) {
  const s = Math.max(1, Math.floor(ms / 1000));
  return (
    (s >= 3600 ? Math.floor(s / 3600) + "小时" : "") +
    (s >= 60 ? (Math.floor(s / 60) % 60) + "分" : "") +
    (s % 60) +
    "秒"
  );
}
function Detail({ seq }: { seq: number }) {
  const { theme, instance, hostId } = useChat(),
    fetch = useRpc(eventDetail);
  const q = useQuery({
    queryKey: ["router-event", hostId, instance, seq],
    queryFn: () => fetch({ instance, seq }),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }}>
      <Text
        selectable
        style={{ color: theme.colors.foreground, fontSize: 12, lineHeight: 19 }}
      >
        {q.error
          ? errorText(q.error)
          : q.isPending
            ? "正在读取…"
            : q.data || "（空）"}
      </Text>
    </ScrollView>
  );
}
function Fold({
  label,
  icon,
  stamp,
  variant = "step",
  children,
  fixed,
}: {
  label: string;
  icon?: string;
  stamp?: string;
  variant?: "trigger" | "process" | "step";
  children?: ReactNode;
  fixed?: boolean;
}) {
  const {
      theme: { colors: c },
    } = useChat(),
    [open, setOpen] = useState(false),
    boxed = variant === "trigger",
    divider = variant === "process";
  const toggle = !!children && !fixed,
    show = !!children && (fixed || open);
  return (
    <View
      style={
        boxed
          ? {
              backgroundColor: c.surface1,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 13,
            }
          : undefined
      }
    >
      <Pressable
        accessibilityRole={toggle ? "button" : undefined}
        accessibilityLabel={label}
        accessibilityState={toggle ? { expanded: open } : undefined}
        disabled={!toggle}
        onPress={() => setOpen(!open)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: boxed ? 9 : 5,
          minHeight: boxed ? 44 : 33,
          paddingHorizontal: boxed ? 14 : 0,
          borderBottomWidth: divider ? 1 : 0,
          borderColor: c.border,
        }}
      >
        {icon && <Icon name={icon} size={15} color={c.foregroundMuted} />}
        <Text
          style={{
            color: c.foregroundMuted,
            fontSize: variant === "step" ? 13 : 14,
            flexShrink: 1,
          }}
        >
          {label}
        </Text>
        {stamp && (
          <Text
            style={{
              color: c.foregroundMuted,
              fontSize: 12,
              marginLeft: "auto",
            }}
          >
            {stamp}
          </Text>
        )}
        {toggle && (
          <Icon
            name={open ? "ChevronUp" : "ChevronDown"}
            size={14}
            color={c.foregroundMuted}
          />
        )}
      </Pressable>
      {show && (
        <View
          style={{
            gap: 6,
            paddingVertical: 8,
            paddingLeft: boxed ? 36 : divider ? 0 : 12,
            paddingRight: boxed ? 12 : 0,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
function ImagePreview({ file, seq }: { file: Attachment; seq: number }) {
  const { instance, hostId, theme } = useChat(),
    fetch = useRpc(imageAttachment);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const q = useQuery({
    queryKey: ["router-image", hostId, instance, seq, file.id],
    queryFn: ({ signal }) =>
      loadImage(signal, () => fetch({ instance, seq, id: file.id! })),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    retryOnMount: false,
  });
  if (q.data && !decodeFailed)
    return (
      <Image
        accessibilityLabel={file.name}
        resizeMode="contain"
        source={{ uri: "data:" + q.data.mime + ";base64," + q.data.data }}
        style={{ width: "100%", height: "100%" }}
        onError={() => setDecodeFailed(true)}
      />
    );
  return (
    <Text
      numberOfLines={2}
      style={{
        fontSize: 12,
        color: theme.colors.foregroundMuted,
        textAlign: "center",
      }}
    >
      {q.error || decodeFailed ? "图片无法预览" : "加载图片…"}
    </Text>
  );
}
function ImageSlot({ file, seq }: { file: Attachment; seq: number }) {
  const { images, theme } = useChat();
  const node = useRef<View>(null),
    [near, setNear] = useState(false);
  useEffect(() => {
    if (node.current) return images.watch(node.current, setNear);
  }, [images]);
  const ratio =
    file.width && file.height ? file.width / file.height : 230 / 150;
  return (
    <View
      ref={node}
      collapsable={false}
      onLayout={images.layoutChanged}
      style={{
        maxWidth: "100%",
        width: Math.min(230, 180 * ratio),
        aspectRatio: ratio,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: theme.colors.surface1,
        justifyContent: "center",
      }}
    >
      {near && <ImagePreview file={file} seq={seq} />}
    </View>
  );
}
function FileCard({ file, seq }: { file: Attachment; seq: number }) {
  const {
    theme: { colors: c },
  } = useChat();
  if (file.kind === "image" && file.id)
    return <ImageSlot file={file} seq={seq} />;
  const ext = file.name.includes(".")
      ? file.name.split(".").pop()?.toUpperCase()
      : "文件",
    b = file.bytes;
  const size =
    b === undefined
      ? ""
      : b < 1024
        ? b + "B"
        : b < 1048576
          ? +(b / 1024).toFixed(1) + " KB"
          : +(b / 1048576).toFixed(1) + " MB";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        width: 240,
        maxWidth: "100%",
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 13,
        padding: 12,
        backgroundColor: c.surface0,
      }}
    >
      <Icon
        name={file.kind === "image" ? "Image" : "FileText"}
        size={26}
        color={c.foregroundMuted}
      />
      <View style={{ flexShrink: 1, gap: 3 }}>
        <Text
          selectable
          numberOfLines={2}
          style={{ fontWeight: "600", color: c.foreground }}
        >
          {file.name}
        </Text>
        <Text style={{ fontSize: 12, color: c.foregroundMuted }}>
          {file.kind === "image"
            ? "图片无法预览"
            : [ext, size].filter(Boolean).join("  ")}
        </Text>
      </View>
    </View>
  );
}
function EventFiles({ event }: { event: TranscriptEvent }) {
  return event.files?.map((file, i) => (
    <FileCard
      file={file}
      seq={event.seq}
      key={event.seq + ":" + i + ":" + file.id}
    />
  ));
}
function Footer({
  event,
  tokens,
}: {
  event: TranscriptEvent;
  tokens?: number;
}) {
  const {
    theme: { colors: c },
    report,
  } = useChat();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {tokens !== undefined && tokens > 0 && (
        <Text style={{ fontSize: 11, color: c.foregroundMuted }}>
          用量 {compactNumber(tokens)} tok
        </Text>
      )}
      <Text style={{ fontSize: 11, color: c.foregroundMuted }}>
        {clock(event.time)}
      </Text>
      {!!event.text && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="复制消息"
          hitSlop={4}
          onPress={() =>
            copyText(event.text!).catch((e) => report(errorText(e)))
          }
          style={{ padding: 4 }}
        >
          <Icon name="Copy" color={c.foregroundMuted} size={13} />
        </Pressable>
      )}
    </View>
  );
}
function Message({
  event,
  user = false,
  footer,
  tokens,
}: {
  event: TranscriptEvent;
  user?: boolean;
  footer?: boolean;
  tokens?: number;
}) {
  const {
    theme: { colors: c },
  } = useChat();
  return (
    <View
      style={{ alignItems: user ? "flex-end" : "stretch", gap: 6, minWidth: 0 }}
    >
      <EventFiles event={event} />
      {!!event.text &&
        (user ? (
          <View
            style={{
              borderRadius: 16,
              paddingVertical: 9,
              paddingHorizontal: 15,
              maxWidth: "88%",
              backgroundColor: "rgba(105,160,245,0.16)",
            }}
          >
            <Text
              selectable
              style={{ fontSize: 15, lineHeight: 23, color: c.foreground }}
            >
              {event.text}
            </Text>
          </View>
        ) : (
          <Markdown>{event.text}</Markdown>
        ))}
      {footer && <Footer event={event} tokens={tokens} />}
    </View>
  );
}
function Trigger({ event: e }: { event: TranscriptEvent }) {
  const {
    theme: { colors: c },
  } = useChat();
  if (e.form === "continuation")
    return (
      <Text style={{ color: c.foregroundMuted, fontSize: 13 }}>
        已请求继续生成
      </Text>
    );
  const titles: Record<string, string> = {
    goal: "继续执行目标",
    "agent-message": "收到任务消息",
    "team-message": "收到团队消息",
    "subagent-settled": "子任务状态更新",
    webhook: e.form === "github" ? "收到 GitHub 事件" : "收到外部事件",
    schedule: "自动化任务",
    "tool-jobs": "后台任务状态更新",
    "cordis-host-runner": "插件状态更新",
  };
  return (
    <Fold
      variant="trigger"
      label={titles[e.source || ""] || "收到执行请求"}
      icon="Inbox"
      stamp={clock(e.time)}
    >
      <Text style={{ fontSize: 12, color: c.foregroundMuted }}>
        这条通知触发了本轮回复。
      </Text>
      <Detail seq={e.seq} />
      <EventFiles event={e} />
    </Fold>
  );
}
function ProcessEntry({
  event: e,
  turn,
}: {
  event: TranscriptEvent;
  turn: Turn;
}) {
  const {
    theme: { colors: c },
  } = useChat();
  if (e.kind === "user") return <Message event={e} user footer />;
  if (e.kind === "trigger") return <Trigger event={e} />;
  if (e.kind === "context")
    return (
      <Fold label={"上下文注入 " + (e.name || e.source || "")} icon="Layers">
        <Detail seq={e.seq} />
        <EventFiles event={e} />
      </Fold>
    );
  if (e.kind === "call") {
    const result = e.call ? turn.results.get(e.call) : undefined;
    return (
      <Fold
        label={"工具调用 " + (e.name || "") + (result?.error ? " · 失败" : "")}
        icon="Wrench"
      >
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>参数</Text>
        <Detail seq={e.seq} />
        {result && (
          <>
            <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>结果</Text>
            <Detail seq={result.seq} />
            <EventFiles event={result} />
          </>
        )}
      </Fold>
    );
  }
  if (e.kind === "assistant")
    return (
      <View style={{ gap: 5 }}>
        {e.reasoning && (
          <Fold label="思考" icon="Brain">
            <Detail seq={e.seq} />
          </Fold>
        )}
        {turn.answer !== e && <Message event={e} />}
      </View>
    );
  return null;
}
// The Web chat groups contiguous work between independent replies and human input.
function processGroups(turn: Turn): ReactNode[] {
  const groups: ReactNode[] = [];
  let batch: TranscriptEvent[] = [];
  function flush() {
    if (!batch.length) return;
    const calls = batch.filter((e) => e.kind === "call");
    const actions: Record<string, string> = {
      read: "读取文件",
      read_file: "读取文件",
      write: "写入文件",
      edit: "编辑文件",
      bash: "执行命令",
      web_search: "搜索网页",
      web_fetch: "访问网页",
      subagent: "协调子智能体",
    };
    const counts = new Map<string, number>();
    for (const e of calls) {
      const verb = actions[e.name || ""] || "调用工具";
      counts.set(verb, (counts.get(verb) || 0) + 1);
    }
    const verbs = [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([v]) => v);
    const title =
      "已" +
      (verbs.length
        ? verbs.join("并")
        : batch.every((e) => e.kind === "context")
          ? "注入上下文"
          : "完成分析");
    groups.push(
      <Fold
        key={batch[0].seq}
        label={title}
        icon={
          calls.length
            ? "Wrench"
            : batch[0].kind === "context"
              ? "Layers"
              : "Brain"
        }
      >
        {batch.map((e) => (
          <ProcessEntry key={e.seq} event={e} turn={turn} />
        ))}
      </Fold>,
    );
    batch = [];
  }
  for (const e of turn.process) {
    if (
      e.kind === "user" ||
      e.kind === "trigger" ||
      (e.kind === "assistant" &&
        e !== turn.answer &&
        (e.text?.trim() || e.files?.length))
    ) {
      flush();
      groups.push(<ProcessEntry key={e.seq} event={e} turn={turn} />);
    } else batch.push(e);
  }
  flush();
  return groups;
}
export function TurnView({ turn: t, card }: { turn: Turn; card?: ActionCard }) {
  const { theme, report } = useChat(),
    c = theme.colors,
    end = t.end,
    reason = end?.name,
    stopped = reason === "aborted" || reason === "interrupted",
    failed = reason === "error";
  const title = stopped
    ? "已停止"
    : failed
      ? "处理失败"
      : t.start && end
        ? "已完成，用时 " + elapsed(end.time - t.start.time)
        : "已完成";
  const steps = t.process.length
    ? end
      ? processGroups(t)
      : t.process.map((e) => <ProcessEntry key={e.seq} event={e} turn={t} />)
    : undefined;
  return (
    <View style={{ gap: 10, marginVertical: 10 }}>
      {t.inputs.map((e) =>
        e.kind === "user" ? (
          <Message key={e.seq} event={e} user footer />
        ) : (
          <Trigger key={e.seq} event={e} />
        ),
      )}
      {end ? (
        <Fold
          variant="process"
          label={title}
          fixed={
            failed ||
            stopped ||
            t.process.some((e) => e.kind === "user" || e.kind === "trigger")
          }
        >
          {steps}
        </Fold>
      ) : (
        steps
      )}
      {failed && end?.text && (
        <Text selectable style={{ color: c.statusDanger }}>
          {end.text}
        </Text>
      )}
      {t.answer && <Message event={t.answer} footer tokens={t.tokens} />}
      {end &&
        [...t.plans.values()].map((plan) => (
          <Fold
            key={plan.callId}
            variant="trigger"
            label={plan.title}
            icon="ClipboardList"
          >
            <Markdown>{plan.markdown}</Markdown>
          </Fold>
        ))}
      {t.answer && t.presented.size > 0 && (
        <PresentedFiles files={t.presented} theme={theme} report={report} />
      )}
      {end && t.answer && card && (
        <ProposalCard key={card.callId} card={card} theme={theme} />
      )}
    </View>
  );
}
