import { Copy, Fold, Link, RecordLine, Section, useSurface } from "./surface";
import type { Route } from "../shared/supervision";
const words: Record<string, string> = {
  ready: "运行中",
  starting: "启动中",
  setup: "等待部署检查",
  off: "已关闭",
  missing: "未安装",
  paused: "待处理",
  error: "出错",
  evaluating: "评估中",
  queued: "排队中",
  subscribed: "已被订阅",
  dormant: "休眠",
  unsubscribed: "未被订阅",
  accept: "接单",
  reopen: "续做",
  stop: "停止",
  ignore: "忽略",
  unavailable: "未完成",
  wouldAccept: "仅观察",
  person: "待处理",
  working: "执行中",
  idle: "等待新触发",
  ended: "已结束",
  answer: "待回答",
  review: "待验收",
  delivery: "输入未送达",
  failed: "执行失败",
  blocked: "受阻",
  wecom: "企业微信",
  forgejo: "Forgejo",
  not_human: "自动消息",
  no_mention: "没有点名智能体",
  admission_ignored: "准入设为忽略",
  not_a_member: "发送者不在来源名单中",
  explicit: "明确",
  inferred: "推断",
  observed: "仅观察",
  completed: "已完成",
  stopped: "已停止",
  merged: "已合并",
  closed: "已关闭",
  routed: "已转给工单",
  timeout: "评估超时",
  hostRestarted: "Superagent 已重启",
  noRuleMatched: "没有匹配的准入规则",
  explicitRouted: "名单成员明确请求，主会话已接单",
  policyChanged: "评估期间策略已更新",
  senderNotMember: "发送者不在来源名单中",
  directionUnsettled: "请求目标尚未确定",
  source_disabled: "来源已关闭",
  chat_not_allowed: "不在监听范围内",
  issue_closed: "Issue 已关闭",
  subscription_inactive: "订阅未生效",
  noAdmissible: "没有可准入的触发",
  running: "运行中",
  finished: "已结束",
};
export const word = (v?: string) => (v ? words[v] || v : "");
export const join = (...parts: unknown[]) =>
  parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");
export const when = (at?: string) =>
  at
    ? new Date(at).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
export function str(v: any): string {
  if (v == null) return "";
  if (typeof v !== "object") return typeof v === "string" ? word(v) : String(v);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join("；");
  return str(
    v.zh ??
      v.en ??
      v.text ??
      v.name ??
      v.detail ??
      v.label ??
      v.reason ??
      v.values?.text ??
      v.id ??
      word(v.code),
  );
}
export function Ticket({ v }: { v: any }) {
  const { go } = useSurface();
  return (
    <RecordLine
      icon="Ticket"
      stage={word(v.action || v.stage)}
      title={v.title}
      body={str(v.attention?.question) || str(v.summary) || undefined}
      meta={join(v.threads?.[0]?.title, when(v.updatedAt))}
      onPress={() => go({ page: "工单", id: v.id })}
    />
  );
}
export function Thread({ v }: { v: any }) {
  const { go } = useSurface();
  return (
    <RecordLine
      icon="MessagesSquare"
      stage={word(v.stage)}
      title={v.title || v.key}
      body={v.latest && join(str(v.latest.actor), v.latest.preview)}
      meta={join(
        word(v.source),
        v.pollError ||
          v.tickets
            ?.filter((t: any) => t.state === "open")
            .map((t: any) => t.title)
            .join("、"),
        when(v.lastAt),
      )}
      onPress={() => go({ page: "线程", id: v.key })}
    />
  );
}
export function Decision({ v }: { v: any }) {
  const { go } = useSurface();
  return (
    <RecordLine
      icon="GitBranch"
      stage={word(v.outcome || v.kind)}
      title={v.ticketTitle || v.threadTitle || v.preview}
      body={v.preview}
      meta={join(
        str(v.reason),
        v.rules
          ?.filter((rule: any) => rule.matched)
          .map((rule: any) => rule.name)
          .join("、"),
        when(v.at),
      )}
      onPress={
        v.ticketId
          ? () => go({ page: "工单", id: v.ticketId })
          : v.thread
            ? () =>
                go({ page: "线程", id: v.thread, around: v.triggerIds?.[0] })
            : undefined
      }
    />
  );
}
export function Detail({ v, route }: { v: any; route: Route }) {
  const { go, confirm } = useSurface();
  if (route.page === "线程")
    return (
      <>
        <Section name={v.title}>
          <Copy quiet>
            {join(word(v.source), word(v.stage), when(v.lastAt))}
          </Copy>
        </Section>
        {!!v.tickets?.length && (
          <Section name="订阅工单" count={v.tickets.length}>
            {v.tickets.map((t: any) => (
              <Ticket key={t.id} v={t} />
            ))}
            <Link
              onPress={() =>
                confirm("取消这个线程的订阅？", {
                  kind: "unsubscribe",
                  id: v.key,
                })
              }
            >
              取消订阅
            </Link>
          </Section>
        )}
        {!!v.correlated?.length && (
          <Section name="关联线程">
            {v.correlated.map((t: any) => (
              <Link key={t.key} onPress={() => go({ page: "线程", id: t.key })}>
                {t.title}
              </Link>
            ))}
          </Section>
        )}
        <Section name="触发记录" count={v.timeline.length}>
          {v.timeline.map((t: any) => (
            <Fold
              key={t.id}
              label={join(
                str(t.actor) || word(t.source),
                t.preview || "查看触发",
              )}
            >
              <Copy>{str(t.text) || t.preview}</Copy>
              <Copy quiet>
                {join(
                  when(t.at),
                  t.disposition?.delivered
                    ? "已送达"
                    : t.disposition?.queued
                      ? "排队中"
                      : t.disposition?.evaluating
                        ? "评估中"
                        : word(t.disposition?.decision?.outcome) ||
                          str(t.disposition?.filtered),
                )}
              </Copy>
              {t.actions?.requeue && (
                <Link
                  onPress={() =>
                    confirm("将这条触发重新送入评估？", {
                      kind: "requeue",
                      id: t.id,
                    })
                  }
                >
                  重新评估
                </Link>
              )}
            </Fold>
          ))}
          {v.earlier && (
            <Link
              onPress={() =>
                go({ ...route, around: undefined, before: v.earlier })
              }
            >
              更早的触发
            </Link>
          )}
        </Section>
        {!!v.decisions.length && (
          <Section name="评估决定">
            {v.decisions.map((d: any) => (
              <Decision key={d.id} v={d} />
            ))}
          </Section>
        )}
      </>
    );
  return (
    <>
      <Section name={v.title}>
        <Copy quiet>{join(word(v.action || v.stage), when(v.updatedAt))}</Copy>
        {!!v.ended && (
          <Copy quiet>
            {join(word(v.ended.outcome), str(v.ended.reason), when(v.ended.at))}
          </Copy>
        )}
        {!!v.summary && <Copy>{v.summary}</Copy>}
        {!!v.attention?.question && <Copy>{str(v.attention.question)}</Copy>}
      </Section>
      <Section name="授权详情">
        <Copy>{str(v.mandate?.scope) || "—"}</Copy>
        <Copy quiet>{join(str(v.mandate?.actor), word(v.strength))}</Copy>
        {v.decision && <Decision v={v.decision} />}
      </Section>
      {!!v.threads.length && (
        <Section name="订阅线程">
          {v.threads.map((t: any) => (
            <Thread key={t.key} v={t} />
          ))}
        </Section>
      )}
      <Fold label={"输入 · " + v.inputs.length}>
        {v.inputs.map((x: any, i: number) => (
          <RecordLine
            key={i}
            title={str(x.trigger?.preview) || str(x.text) || x.kind}
            meta={x.delivered ? "已送达" : "未送达"}
          />
        ))}
      </Fold>
      <Fold label={"分配记录 · " + v.assignments.length}>
        {v.assignments.map((x: any, i: number) => (
          <RecordLine
            key={i}
            title={str(x.report?.summary) || x.state}
            meta={when(x.startedAt)}
          />
        ))}
      </Fold>
      {v.actions.retry && (
        <Link
          onPress={() => confirm("重试这张工单？", { kind: "retry", id: v.id })}
        >
          重试工单
        </Link>
      )}
      {v.actions.stop && (
        <Link
          onPress={() =>
            confirm("停止这张工单及其执行任务？", { kind: "stop", id: v.id })
          }
        >
          停止工单
        </Link>
      )}
    </>
  );
}
