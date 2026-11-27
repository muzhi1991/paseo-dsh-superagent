import { useState, type ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import {
  Copy,
  Fold,
  Link,
  RecordLine,
  Section,
  useSettingsDraft,
  useSurface,
} from "./surface";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Prompts } from "./prompts";
import { FieldControl, type Field } from "./config-fields";
import { str, when } from "./records";

const rules: Field = { key: "rules", type: "rules", label: "接单规则" };
const policies: Field = { key: "sources", type: "policy", label: "在各来源上" };
const evalFields: Field[] = [
  {
    key: "mode",
    type: "select",
    label: "接单模式",
    options: [
      { value: "off", label: "关闭" },
      { value: "observe", label: "仅观察" },
      { value: "auto", label: "自动接单" },
    ],
  },
  {
    key: "timeoutSeconds",
    type: "number",
    label: "单次评估时限 / 秒",
    min: 30,
    max: 600,
  },
  { key: "model", type: "model", label: "研判模型" },
];
const executorFields: Field[] = [
  { key: "model", type: "model", label: "执行器模型" },
  { key: "maxWorkers", type: "number", label: "并行工单数", min: 1, max: 16 },
  { key: "directory", type: "text", label: "执行目录的根目录" },
  { key: "prepare", type: "long", label: "准备命令" },
  {
    key: "blockedCommands",
    type: "commands",
    label: "禁止调用的命令",
    hint: "多个命令用空格或逗号分隔。",
  },
];
const limits: Field[] = [
  {
    key: "promptMaxChars",
    type: "number",
    label: "提示词配置的最大字符数",
    min: 1000,
    max: 1000000,
  },
  {
    key: "admissionContextMaxPages",
    type: "number",
    label: "一次研判可读的线程页数",
    min: 1,
    max: 100,
  },
  {
    key: "admissionContextTimeoutMs",
    type: "number",
    label: "一次上下文读取的时限 / 毫秒",
    min: 1,
    max: 90000,
  },
];

function FieldLabel({ text, hint }: { text: string; hint?: string }) {
  const [open, setOpen] = useState(false),
    {
      theme: { colors },
    } = useSurface();
  return (
    <View style={{ flexShrink: 1, gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Copy bold>{text}</Copy>
        {!!hint && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text + "说明"}
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen(!open)}
            hitSlop={4}
          >
            <Icon name="Info" size={13} color={colors.foregroundMuted} />
          </Pressable>
        )}
      </View>
      {open && <Copy quiet>{hint}</Copy>}
    </View>
  );
}
function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const {
    theme: { colors },
  } = useSurface();
  return (
    <View
      style={{
        padding: 14,
        borderColor: colors.border,
        borderWidth: 0.5,
        borderRadius: 14,
        gap: 9,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Copy bold>{title}</Copy>
        {action}
      </View>
      {children}
    </View>
  );
}
function History({ group, v }: { group: string; v: any }) {
  const entries = (v.history || []).filter((h: any) =>
    group === "source"
      ? h.block?.startsWith("source:")
      : group === "eval"
        ? h.policyChanged || !h.block || ["eval", "policy"].includes(h.block)
        : ["pause", "executor"].includes(h.block),
  );
  return (
    <Fold label="配置历史">
      {entries.length === 0 && <Copy quiet>暂无该页的配置记录。</Copy>}
      {entries.map((h: any) => (
        <View key={h.revision}>
          <RecordLine
            title={"版本 " + h.revision}
            meta={[
              when(h.savedAt),
              h.source,
              h.policyChanged && h.policyVersion?.slice(0, 8),
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          {h.changes?.map((c: any, i: number) => {
            const source = v.sources.find((s: any) => s.id === c.source);
            const f = (c.part ? source?.policy?.fields : source?.fields)?.find(
              (f: Field) => f.key === c.field,
            );
            return (
              <Copy quiet key={i}>
                {[
                  str(source?.title),
                  str(f?.label) || changeNames[c.code] || c.code,
                  c.name,
                  c.items?.join("、"),
                  c.from !== undefined
                    ? String(c.from) + " → " + String(c.to)
                    : c.to,
                ]
                  .filter((x) => x !== undefined && x !== "")
                  .join(" · ")}
              </Copy>
            );
          })}
          {!!h.notified?.length && (
            <Copy quiet>
              {"已通知工单：" + h.notified.map((t: any) => t.title).join("、")}
            </Copy>
          )}
        </View>
      ))}
    </Fold>
  );
}
const changeNames: Record<string, string> = {
  ruleAdded: "添加规则",
  ruleRemoved: "移除规则",
  ruleEnabled: "启用规则",
  ruleDisabled: "停用规则",
  ruleInstruction: "修改规则指令",
  ruleRenamed: "规则改名",
  maxWorkers: "并行工单数",
  mode: "接单模式",
  timeout: "评估时限",
  evalModel: "研判模型",
  executorModel: "执行器模型",
  paused: "暂停处理",
  resumed: "恢复处理",
  executionDirectory: "执行目录",
  prepareCommand: "准备命令",
  blockedCommands: "禁止调用的命令",
  sourceEnabled: "启用来源",
  sourceDisabled: "关闭来源",
  sourceAdmission: "来源准入",
};
type Draft = { revision: number; base: any; changes: Record<string, any> };
function Block({ block, v, source }: { block: string; v: any; source?: any }) {
  const { confirm, go } = useSurface(),
    machine = block === "deployment",
    policy = block === "policy",
    executor = block === "executor";
  const { revision, value } = machine
    ? v.form || { revision: 0, value: v.machine }
    : source || v.blocks[block];
  const [draft, setDraft] = useSettingsDraft<Draft>(block),
    [message, setMessage] = useState("");
  const base = draft?.base || value;
  const get = (k: string) =>
    draft && Object.hasOwn(draft.changes, k)
      ? draft.changes[k]
      : source && k !== "enabled"
        ? base.config[k]
        : base[k];
  const edit = (key: string, next: any) => {
    setMessage("");
    setDraft((old) => ({
      revision: old?.revision ?? revision,
      base: old?.base ?? value,
      changes: { ...old?.changes, [key]: next },
    }));
  };
  const fields: Field[] = source
    ? source.fields
    : machine
      ? limits
      : policy
        ? [rules, policies]
        : executor
          ? executorFields
          : evalFields;
  function field(f: Field) {
    const label = str(f.label),
      val = get(f.key);
    if (f.type === "fact" || f.readonly)
      return (
        <View key={f.key}>
          <RecordLine
            title={label}
            meta={str(source?.facts?.[f.key] ?? val) || "—"}
          />
          {f.settings && (
            <Link onPress={() => go({ page: "设置", filter: f.settings })}>
              打开部署设置
            </Link>
          )}
        </View>
      );
    if (f.type === "switch")
      return (
        <View
          key={f.key}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <FieldLabel text={label} hint={str(f.hint)} />
          <Switch
            accessibilityLabel={label}
            value={!!val}
            onValueChange={(next) => edit(f.key, next)}
          />
        </View>
      );
    return (
      <View key={f.key} style={{ gap: 4 }}>
        {f.type !== "rules" && <FieldLabel text={label} hint={str(f.hint)} />}
        {machine && !v.form?.writable ? (
          <Copy>{String(v.machine[f.key] ?? "—")}</Copy>
        ) : (
          <FieldControl
            field={f}
            value={val}
            change={(next) => edit(f.key, next)}
            sources={v.sources}
            labels={source?.labels}
            sourceId={source?.id}
            models={v.models}
            saved={source ? base.config[f.key] : base[f.key]}
            dirty={!!draft}
          />
        )}
        {f.key === "directory" && !val && (
          <Copy quiet>{"默认目录：" + v.environment.root}</Copy>
        )}

        {!!source?.facts?.[f.key] && val === base.config[f.key] && (
          <Copy quiet>{str(source.facts[f.key])}</Copy>
        )}
      </View>
    );
  }
  const title = machine
    ? "上限"
    : source
      ? str(source.title)
      : policy
        ? "策略"
        : executor
          ? "执行器"
          : "评估设置";
  function save() {
    if (!draft) return;
    const changes = { ...draft.changes };
    try {
      for (const f of fields) {
        if (!Object.hasOwn(changes, f.key)) continue;
        const raw = changes[f.key],
          label = str(f.label);
        if (f.type === "number") {
          if (machine && String(raw).trim() === "") {
            changes[f.key] = null;
            continue;
          }
          const n = Number(raw);
          if (
            !String(raw).trim() ||
            !Number.isInteger(n) ||
            n < (f.min ?? -Infinity) ||
            n > (f.max ?? Infinity)
          )
            throw Error(
              label +
                "需要填写范围内的整数" +
                (f.min !== undefined ? "（" + f.min + "–" + f.max + "）" : ""),
            );
          changes[f.key] = n;
        }
        if (f.type === "commands")
          changes[f.key] = String(raw)
            .split(/[\s,]+/)
            .filter(Boolean);
      }
    } catch (e) {
      setMessage((e as Error).message);
      return;
    }
    setMessage("");
    const done = () => {
      setDraft(null);
      setMessage("已保存");
    };
    if (machine) {
      confirm(
        "保存本机部署上限？",
        { kind: "deployment", revision: draft.revision, changes },
        done,
      );
      return;
    }
    const next = source ? { ...base, config: { ...base.config } } : { ...base };
    for (const [k, val] of Object.entries(changes))
      (source && k !== "enabled" ? next.config : next)[k] = val;
    const restarts = source?.restarts?.some((k: string) =>
      Object.hasOwn(changes, k),
    );
    confirm(
      "保存「" +
        title +
        "」的修改？" +
        (restarts ? "这个字段将触发部署重新检查。" : ""),
      { kind: "settings", block, revision: draft.revision, value: next },
      done,
    );
  }
  const visible = fields.filter((f) => !f.advanced);
  return (
    <View style={{ gap: 12 }}>
      {machine && (
        <>
          <Copy quiet>
            这些参数存放在 DSH 配置的 dsh-superagent 条目中，保存后立即生效。
          </Copy>
          <Section name="本机设置">
            <RecordLine title="状态目录" meta={v.machine.stateDir} />
            {!v.form?.writable && (
              <Copy quiet>当前 DSH 实例将这些参数设为只读。</Copy>
            )}
            {v.problem && (
              <>
                <Copy>{str(v.problem)}</Copy>
                <Link
                  onPress={() =>
                    confirm("重新检查部署？这会重启 Superagent。", {
                      kind: "check-setup",
                    })
                  }
                >
                  重新检查部署
                </Link>
              </>
            )}
          </Section>
        </>
      )}
      <Card
        title={title}
        action={
          source?.installed ? (
            <Switch
              accessibilityLabel={"启用" + title}
              value={!!get("enabled")}
              onValueChange={(v) => edit("enabled", v)}
            />
          ) : undefined
        }
      >
        {policy && (
          <Copy quiet>{"策略版本　" + v.policyVersion.slice(0, 8)}</Copy>
        )}
        {source?.problem && <Copy>{str(source.problem)}</Copy>}
        {source && !source.installed ? (
          <Copy quiet>来源插件未安装。</Copy>
        ) : (
          <>
            {(executor ? visible.slice(0, 2) : visible).map(field)}
            {fields.some((f) => f.advanced) && (
              <Fold label="高级">
                {fields.filter((f) => f.advanced).map(field)}
              </Fold>
            )}
          </>
        )}
      </Card>
      {executor && (
        <Card title="执行环境">
          {field(fields[2])}
          {field(fields[3])}
          <Fold label="可用的环境变量">
            {v.environment.variables.flatMap((g: any) =>
              g.variables.map((item: any) => (
                <View key={g.owner + item.key}>
                  <Link
                    onPress={() =>
                      edit(
                        "prepare",
                        (get("prepare") || "") + '"' + "$" + item.key + '"',
                      )
                    }
                  >
                    {item.key}
                  </Link>
                  <Copy quiet>{str(item.description)}</Copy>
                </View>
              )),
            )}
          </Fold>
          {field(fields[4])}
        </Card>
      )}
      {!!message && <Copy>{message}</Copy>}
      {draft && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Copy quiet>有未保存的修改</Copy>
          <Link
            onPress={() => {
              setDraft(null);
              setMessage("");
            }}
          >
            放弃更改
          </Link>
          <Link onPress={save}>保存修改</Link>
        </View>
      )}
    </View>
  );
}
export function BusinessSettings({
  group,
  v,
  instance,
}: {
  group: string;
  v: any;
  instance: string;
}) {
  if (group === "prompts") return <Prompts v={v} instance={instance} />;
  if (group === "deployment")
    return (
      <Section name="部署">
        <Block block="deployment" v={v} />
      </Section>
    );
  return (
    <Section
      name={group === "source" ? "来源" : group === "eval" ? "评估" : "执行"}
    >
      <View style={{ gap: 15 }}>
        {group === "source" ? (
          v.sources.map((s: any) => (
            <Block key={s.id} block={"source:" + s.id} source={s} v={v} />
          ))
        ) : group === "eval" ? (
          <>
            <Block block="policy" v={v} />
            <Block block="eval" v={v} />
          </>
        ) : (
          <Block block="executor" v={v} />
        )}
        <History group={group} v={v} />
      </View>
    </Section>
  );
}
