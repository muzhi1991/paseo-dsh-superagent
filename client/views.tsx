import { GitHubRepositoryLink } from "./source-link";
import { useState } from "react";
import { Icon } from "@getpaseo/plugin/client/ui";
import { View, Text, Pressable, ScrollView } from "react-native";
import {
  FilterPills,
  Copy,
  Fold,
  Link,
  RecordLine,
  Section,
  useSurface,
} from "./surface";
import {
  Decision,
  Detail,
  Thread,
  Ticket,
  join,
  str,
  when,
  word,
} from "./records";
import { BusinessSettings } from "./business-settings";
import { filters, type Route } from "../shared/supervision";
import type { RpcOutput } from "@getpaseo/plugin";
import { view } from "../shared/supervision";

type Metric = [string, number | string, Route?];
function Metrics({ items }: { items: Metric[] }) {
  const {
    go,
    theme: { colors },
  } = useSurface();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
      {items.map(([label, value, route]) => (
        <Pressable
          key={label}
          disabled={!route}
          onPress={() => route && go(route)}
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 5,
            paddingVertical: 3,
          }}
        >
          <Copy quiet>{label}</Copy>
          <Text
            style={{
              fontVariant: ["tabular-nums"],
              color: route ? colors.accent : colors.foreground,
              fontSize: 14,
            }}
          >
            {value}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function Problem({ v }: { v: any }) {
  const { go } = useSurface();
  const labels: Record<string, string> = {
    setup: "部署检查未通过",
    "no-source": "没有运行中的来源",
    "no-allowed": "来源尚未设置允许的发送者",
    "executor-paused": "执行器已暂停",
    "runtime-error": "运行异常",
    "source-error": "来源异常",
    "eval-overdue": "评估超时",
    "eval-unavailable": "评估未完成",
    outgoing: "回复发送失败",
  };
  const targets: Record<string, Route> = {
    setup: { page: "设置", filter: "deployment" },
    "no-source": { page: "设置", filter: "source" },
    "no-allowed": { page: "设置", filter: "eval" },
    "executor-paused": { page: "执行" },
    "source-error": { page: "来源" },
  };
  const route = v.thread
    ? { page: "线程" as const, id: v.thread.key, around: v.triggerId }
    : targets[v.kind];
  return (
    <RecordLine
      icon="TriangleAlert"
      title={join(
        labels[v.kind] || v.kind,
        str(v.source?.title || v.thread?.title || v.name),
      )}
      body={
        str(
          v.detail || v.reason || v.source?.health?.detail || v.outgoing?.error,
        ) || undefined
      }
      onPress={route ? () => go(route) : undefined}
    />
  );
}
function Overview({ v }: { v: any }) {
  const { go } = useSurface(),
    f = v.flow,
    x = v.executor;
  return (
    <>
      <Section name="待处理工单" count={v.person.length}>
        {v.person.length ? (
          v.person.map((t: any) => <Ticket key={t.id} v={t} />)
        ) : (
          <Copy quiet>没有待处理的工单。</Copy>
        )}
      </Section>
      {!!v.problems.length && (
        <Section name="系统问题" count={v.problems.length}>
          {v.problems.map((p: any, i: number) => (
            <Problem key={i} v={p} />
          ))}
        </Section>
      )}
      <Section
        name="过去 24 小时"
        extra={
          <Link onPress={() => go({ page: "触发", filter: "recent" })}>
            详情 ›
          </Link>
        }
      >
        <Metrics
          items={[
            ["到达", f.received],
            ["被过滤", f.filtered, { page: "来源" }],
            ["已评估", f.judged],
            ["接单或续做", f.accepted, { page: "评估", recent: true }],
            ...(f.dropped
              ? [["已丢弃", f.dropped, { page: "来源" }] as Metric]
              : []),
          ]}
        />
      </Section>
      <Section
        name="执行器"
        extra={<Link onPress={() => go({ page: "执行" })}>详情 ›</Link>}
      >
        <Metrics
          items={[
            ["执行中", x.running + " / " + x.maxWorkers],
            ["排队", x.queued],
            ["等待新触发", x.idle],
          ]}
        />
      </Section>
    </>
  );
}
const introductions: Record<string, string> = {
  来源: "每个来源的运行状态，以及过去 24 小时到达和被过滤的触发。",
  触发: "触发按线程归组，查看订阅工单和评估记录。",
  评估: "评估按策略对触发做出的决定，每条写明理由。",
  执行: "执行器的状态，以及按在等谁分组的工单。",
};
function Sources({ v }: { v: any[] }) {
  const { go } = useSurface();
  return (
    <>
      {v.map((s) => (
        <View key={s.id} style={{ marginBottom: 12 }}>
          <RecordLine
            icon="Radio"
            title={join(str(s.title), word(s.state))}
            meta={join(
              s.stats.received ? "24 小时到达 " + s.stats.received : "",
              s.stats.filtered ? "被过滤 " + s.stats.filtered : "",
              s.stats.lastAt ? "最近 " + when(s.stats.lastAt) : "",
            )}
          />
          {s.id === "github" && <GitHubRepositoryLink repository={s.repository} />}
          {s.problem && <Copy>{str(s.problem) || s.problem.code}</Copy>}
          {s.health
            .filter((h: any) => ["error", "paused"].includes(h.state))
            .map((h: any) => (
              <Copy key={h.name}>{join(h.name, h.detail)}</Copy>
            ))}
          {!!s.filtered.length && (
            <Fold label={"被过滤的触发 · " + s.filtered.length}>
              {s.filtered.map((x: any) => (
                <RecordLine
                  key={x.id}
                  title={x.preview}
                  meta={join(str(x.actor), str(x.reason), when(x.at))}
                />
              ))}
            </Fold>
          )}
          {!!s.dropped.length && (
            <Fold label={"丢弃的回复 · " + s.dropped.length}>
              {s.dropped.map((x: any) => (
                <RecordLine
                  key={x.id}
                  title={x.preview}
                  meta={str(x.dropped)}
                  onPress={
                    x.ticket
                      ? () => go({ page: "工单", id: x.ticket.id })
                      : x.thread
                        ? () => go({ page: "线程", id: x.thread })
                        : undefined
                  }
                />
              ))}
            </Fold>
          )}
        </View>
      ))}
    </>
  );
}
export function PageContents({
  route,
  result,
  setRoute,
  more,
  items,
}: {
  route: Route;
  result: RpcOutput<typeof view>;
  setRoute: (r: Route) => void;
  more?: () => void;
  items: any[];
}) {
  const {
      go,
      confirm,
      compact,
      theme: { colors },
    } = useSurface(),
    v = result.data,
    p = route.page;
  const [hint, setHint] = useState(false);
  if (p === "概览") return <Overview v={v} />;
  if (p === "线程" || p === "工单") return <Detail route={route} v={v} />;
  if (p === "搜索")
    return (
      <Section name={"搜索「" + route.query + "」"}>
        <Copy
          quiet
        >{`找到 ${v.tickets.length} 个工单、${v.threads.length} 个线程、${v.items.length} 条触发`}</Copy>
        {v.tickets.map((t: any) => (
          <Ticket key={t.id} v={t} />
        ))}
        {v.threads.map((t: any) => (
          <Thread key={t.key} v={t} />
        ))}
        {v.items.map((t: any) => (
          <RecordLine
            key={t.id}
            title={t.preview || str(t.text)}
            meta={join(word(t.source), when(t.at), str(t.filtered))}
            onPress={
              t.threadTitle && t.threads?.[0]
                ? () => go({ page: "线程", id: t.threads[0], around: t.id })
                : undefined
            }
          />
        ))}
      </Section>
    );
  const group = p === "来源" ? "source" : p === "评估" ? "eval" : "execution";
  const options = p === "来源" ? null : filters[p];
  const active = route.filter || (options ? Object.keys(options)[0] : "");
  const chips = options && (
    <FilterPills
      items={options}
      active={active}
      choose={(filter) => setRoute({ ...route, filter })}
    />
  );
  if (p === "设置")
    return (
      <View
        style={{
          flex: 1,
          flexDirection: compact ? "column" : "row",
          gap: compact ? 6 : 24,
        }}
      >
        <View
          style={{
            width: compact ? undefined : 140,
            flexDirection: compact ? "row" : "column",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          {Object.entries(filters.设置).map(([k, label]) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityState={{ selected: k === active }}
              onPress={() => setRoute({ ...route, filter: k })}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 7,
                marginTop: k === "prompts" && !compact ? 10 : 0,
                borderRadius: 8,
                backgroundColor: k === active ? colors.surface2 : "transparent",
              }}
            >
              <Text
                style={{
                  color:
                    k === active ? colors.foreground : colors.foregroundMuted,
                  fontWeight: k === active ? "500" : "400",
                  fontSize: 14,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1, minWidth: 0 }}
          contentContainerStyle={{ paddingBottom: 30 }}
        >
          <BusinessSettings
            key={active}
            group={active}
            v={v}
            instance={result.instance}
          />
        </ScrollView>
      </View>
    );
  return (
    <>
      <View style={{ marginBottom: 5 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Copy bold>状态</Copy>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看状态说明"
              onPress={() => setHint(!hint)}
              hitSlop={6}
            >
              <Icon name="Info" size={14} color={colors.foregroundMuted} />
            </Pressable>
          </View>
          {p !== "触发" && (
            <Link onPress={() => go({ page: "设置", filter: group })}>
              设置 ›
            </Link>
          )}
        </View>
        {hint && <Copy quiet>{introductions[p]}</Copy>}
      </View>
      {p === "执行" && (
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Copy>{result.paused ? "执行器已暂停" : "执行器运行中"}</Copy>
          <Copy
            quiet
          >{`执行中 ${result.load.running} / ${result.load.maxWorkers}　排队 ${result.load.queued}`}</Copy>
          <Link
            onPress={() =>
              confirm(
                result.paused ? "恢复评估、派工和回复？" : "暂停处理新任务？",
                { kind: "pause", paused: !result.paused },
              )
            }
          >
            {result.paused ? "恢复处理" : "暂停处理"}
          </Link>
        </View>
      )}
      {p === "评估" && result.paused && <Copy quiet>执行器已暂停</Copy>}
      {chips}
      {p === "评估" && route.recent && (
        <Link onPress={() => setRoute({ ...route, recent: false })}>
          仅过去 24 小时 ×
        </Link>
      )}
      {p === "来源" ? (
        <Sources v={v} />
      ) : items.length ? (
        items.map((x: any) =>
          p === "触发" ? (
            <Thread key={x.key} v={x} />
          ) : p === "评估" ? (
            <Decision key={x.id} v={x} />
          ) : (
            <Ticket key={x.id} v={x} />
          ),
        )
      ) : (
        <Copy quiet>
          {p === "触发" ? "没有符合条件的线程。" : "暂无记录。"}
        </Copy>
      )}
      {more && <Link onPress={more}>加载更多</Link>}
    </>
  );
}
