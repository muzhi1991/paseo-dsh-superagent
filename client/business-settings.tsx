import { useState } from "react";
import { View } from "react-native";
import {
  Chips,
  Copy,
  Fold,
  Link,
  RecordLine,
  Section,
  useSurface,
} from "./surface";
import { Prompts } from "./prompts";
import { FieldControl, type Field } from "./config-fields";
import { str, when } from "./records";

const names: Record<string, string> = {
  enabled: "启用来源",
  rules: "规则",
  sources: "各来源策略",
  mode: "接单模式",
  timeoutSeconds: "评估超时（秒）",
  model: "模型",
  maxWorkers: "并发上限",
  directory: "工单工作目录",
  prepare: "准备命令",
  blockedCommands: "禁止执行的命令",
  communication: "沟通",
  scope: "范围",
  delivery: "交付",
  skills: "技能",
  overrides: "内置提示词覆盖",
};
function Editor({
  title,
  block,
  revision,
  value,
  fields,
  source = false,
  facts = {},
  sources,
}: {
  title: string;
  block: string;
  revision: number;
  value: any;
  fields: Field[];
  source?: boolean;
  facts?: Record<string, unknown>;
  sources?: any[];
}) {
  const { theme, confirm } = useSurface();
  const [draft, setDraft] = useState<{
      revision: number;
      base: any;
      changes: Record<string, unknown>;
    } | null>(null),
    [message, setMessage] = useState("");
  const base = draft?.base || value;
  const get = (k: string) =>
    source && k !== "enabled" ? base.config[k] : base[k];
  const renderField = (f: Field) => {
    const k = f.key,
      name = str(f.label) || names[k] || k,
      original = get(k);
    const v =
      draft && Object.hasOwn(draft.changes, k) ? draft.changes[k] : original;
    const edit = (next: unknown) =>
      setDraft((old) => ({
        revision: old?.revision ?? revision,
        base: old?.base ?? value,
        changes: { ...old?.changes, [k]: next },
      }));
    if (f.type === "fact" || f.readonly)
      return (
        <RecordLine key={k} title={name} meta={str(facts[k] ?? v) || "—"} />
      );
    return (
      <View key={k} style={{ gap: 3, marginVertical: 4 }}>
        <Copy>{name}</Copy>
        <FieldControl
          field={{ ...f, label: name }}
          value={v}
          change={edit}
          sources={sources}
        />
        {!!str(f.hint) && <Copy quiet>{str(f.hint)}</Copy>}
      </View>
    );
  };
  function save() {
    if (!draft) return;
    const next = source ? { ...base, config: { ...base.config } } : { ...base };
    try {
      for (const f of fields) {
        if (!Object.hasOwn(draft.changes, f.key)) continue;
        let v = draft.changes[f.key];
        if (f.type === "number") {
          if (String(v).trim() === "" || !Number.isFinite(Number(v)))
            throw Error((str(f.label) || names[f.key]) + "需要数字");
          v = Number(v);
        }
        if (f.type === "json") {
          try {
            v = JSON.parse(String(v));
          } catch {
            throw Error((str(f.label) || names[f.key]) + " 需要有效 JSON");
          }
        }
        (source && f.key !== "enabled" ? next.config : next)[f.key] = v;
      }
    } catch (e) {
      setMessage(String(e));
      return;
    }
    setMessage("");
    confirm(
      "保存「" +
        title +
        "」的修改？" +
        (source ? "更改部署字段可能重启 Superagent。" : ""),
      block === "prompts"
        ? { kind: "prompts", revision: draft.revision, value: next }
        : { kind: "settings", block, revision: draft.revision, value: next },
      () => setDraft(null),
    );
  }
  return (
    <View
      style={{
        padding: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 12,
        marginBottom: 10,
      }}
    >
      <Copy bold>{title}</Copy>
      {fields.filter((f) => !f.advanced).map(renderField)}
      {fields.some((f) => f.advanced) && (
        <Fold label="高级">
          {fields.filter((f) => f.advanced).map(renderField)}
        </Fold>
      )}
      {draft && (
        <View style={{ flexDirection: "row", gap: 14 }}>
          <Link onPress={save}>保存修改</Link>
          <Link
            onPress={() => {
              setDraft(null);
              setMessage("");
            }}
          >
            放弃更改
          </Link>
        </View>
      )}
      {!!message && <Copy>{message}</Copy>}
    </View>
  );
}
function fieldsFor(value: any): Field[] {
  return Object.entries(value).map(([key, v]) => ({
    key,
    type:
      key === "rules"
        ? "rows"
        : key === "sources"
          ? "policy"
          : key === "model"
            ? "model"
            : key === "mode"
              ? "select"
              : typeof v === "boolean"
                ? "switch"
                : typeof v === "number"
                  ? "number"
                  : typeof v === "object"
                    ? "json"
                    : typeof v === "string" && v.includes("\n")
                      ? "long"
                      : "text",
    columns:
      key === "rules"
        ? [
            { key: "id", type: "text", label: "规则 ID" },
            { key: "name", type: "text", label: "名称" },
            { key: "enabled", type: "switch", label: "启用规则" },
            { key: "instruction", type: "long", label: "判断依据" },
          ]
        : undefined,
    options:
      key === "mode"
        ? [
            { value: "off", label: "仅明确请求" },
            { value: "observe", label: "观察" },
            { value: "auto", label: "自动接单" },
          ]
        : undefined,
  }));
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
  if (group === "deployment")
    return (
      <Section name="部署">
        <RecordLine
          title="部署状态"
          meta={v.problem ? str(v.problem) || v.problem.code : "已就绪"}
        />
        {Object.entries(v.machine || {}).map(([k, x]) => (
          <RecordLine
            key={k}
            title={
              (
                {
                  stateDir: "状态目录",
                  promptMaxChars: "提示词字数上限",
                  admissionContextMaxPages: "上下文最大页数",
                  admissionContextTimeoutMs: "上下文读取超时（毫秒）",
                } as Record<string, string>
              )[k] || k
            }
            meta={String(x)}
          />
        ))}
        <RecordLine title="仓库" meta={str(v.accounts?.repository)} />
      </Section>
    );
  if (group === "prompts") return <Prompts v={v} instance={instance} />;
  if (group === "source")
    return (
      <Section name="来源">
        {v.sources.map((s: any) =>
          !s.installed ? (
            <RecordLine key={s.id} title={str(s.title)} meta="来源插件未安装" />
          ) : (
            <Editor
              key={s.id}
              title={str(s.title)}
              block={"source:" + s.id}
              value={s.value}
              revision={s.revision}
              source
              facts={s.facts}
              fields={[{ key: "enabled", type: "switch" }, ...s.fields]}
            />
          ),
        )}
      </Section>
    );
  return (
    <>
      {(group === "eval" ? ["policy", "eval"] : ["executor"]).map((k) => (
        <Editor
          key={k}
          sources={v.sources}
          title={k === "policy" ? "评估策略" : k === "eval" ? "评估" : "执行器"}
          block={k}
          {...v.blocks[k]}
          fields={fieldsFor(v.blocks[k].value)}
        />
      ))}
      {group === "execution" && (
        <Fold label="执行环境">
          <Copy>{v.environment.root}</Copy>
          {v.environment.variables.map((group: any) => (
            <Fold key={group.owner} label={group.owner}>
              {group.variables.map((x: any) => (
                <RecordLine
                  key={x.key}
                  title={x.key}
                  meta={str(x.description)}
                />
              ))}
            </Fold>
          ))}
        </Fold>
      )}
      <Fold label="配置历史">
        {v.history.map((h: any) => (
          <RecordLine
            key={h.revision}
            title={"版本 " + h.revision}
            meta={[h.block, when(h.savedAt)].filter(Boolean).join(" · ")}
          />
        ))}
      </Fold>
    </>
  );
}
