import { useState } from "react";
import { Switch, TextInput, View } from "react-native";
import { Chips, Copy, Fold, Link, useSurface } from "./surface";
import { str } from "./records";

export type Field = {
  key: string;
  type: string;
  label?: any;
  hint?: any;
  advanced?: boolean;
  readonly?: boolean;
  choose?: any;
  refresh?: any;
  settings?: string;
  min?: number;
  max?: number;
  options?: { label: any; value: string }[];
  columns?: Field[];
};
type Props = {
  field: Field;
  value: any;
  change: (v: any) => void;
  sources?: any[];
  models?: any;
  sourceId?: string;
  labels?: Record<string, string>;
  saved?: any;
  dirty?: boolean;
};
const cellNames: Record<string, string> = {
  listedUnaddressed: "名单内 · 未点名",
  unlistedAddressed: "名单外 · 已点名",
  unlistedUnaddressed: "名单外 · 未点名",
};
function Policies({ sources = [], value = {}, change, dirty, saved }: Props) {
  const { confirm } = useSurface(),
    [selected, setSelected] = useState(""),
    available = sources.filter((s) => s.installed && s.policy);
  const s = available.find((s) => s.id === selected) || available[0];
  if (!s) return null;
  const part = value[s.id] || { allowed: [] },
    update = (key: string, v: any) =>
      change({ ...value, [s.id]: { ...part, [key]: v } });
  return (
    <View style={{ gap: 8 }}>
      <Chips
        items={Object.fromEntries(available.map((s) => [s.id, str(s.title)]))}
        active={s.id}
        choose={setSelected}
      />
      {s.policy.fields.map((f: Field) => (
        <View key={f.key}>
          <Copy>{str(f.label)}</Copy>
          <FieldControl
            field={f}
            labels={s.labels}
            sourceId={s.id}
            saved={saved?.[s.id]?.[f.key]}
            value={part[f.key]}
            change={(v) => update(f.key, v)}
          />
        </View>
      ))}
      {s.policy.sync && (
        <>
          {s.policy.sync.ready && !dirty ? (
            <Link
              onPress={() =>
                confirm("同步来源名单并更新策略？", {
                  kind: "sync-policy",
                  id: s.id,
                })
              }
            >
              {str(s.policy.sync.label)}
            </Link>
          ) : (
            <Copy quiet>
              {str(s.policy.sync.label) +
                (dirty ? "（请先保存或放弃策略更改）" : "（尚未配置同步来源）")}
            </Copy>
          )}
        </>
      )}
      <Copy bold>{s.policy.rows ? "准入" : "明确请求"}</Copy>
      <Copy quiet>{str(s.policy.explicit)}</Copy>
      {s.policy.rows?.map((r: any) => (
        <View key={r.id} style={{ gap: 4 }}>
          <Copy>{s.labels[r.id] || str(r.label)}</Copy>
          <Copy quiet>{str(r.note)}</Copy>
          {Object.keys(r.cells)
            .filter((k) => r.cells[k])
            .map((k) => (
              <View key={k}>
                <Copy quiet>{cellNames[k]}</Copy>
                <Chips
                  active={
                    part.admission?.[r.id]?.[k] ||
                    (k === "listedUnaddressed" ? "inferred" : "ignore")
                  }
                  items={{
                    ignore: "忽略",
                    inferred: "研判",
                    ...(k === "unlistedAddressed"
                      ? { explicit: "明确请求" }
                      : {}),
                  }}
                  choose={(v) =>
                    update("admission", {
                      ...part.admission,
                      [r.id]: { ...part.admission?.[r.id], [k]: v },
                    })
                  }
                />
              </View>
            ))}
        </View>
      ))}
    </View>
  );
}
function Rules({ value: rules, change }: Props) {
  const [open, setOpen] = useState<string>("");
  const id = () =>
    "rule-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8);
  function insert(rule: any, at: number) {
    change([...rules.slice(0, at), rule, ...rules.slice(at)]);
    setOpen(rule.id);
  }
  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Copy bold>接单规则</Copy>
        <Link
          onPress={() =>
            insert(
              { id: id(), name: "", enabled: true, instruction: "" },
              rules.length,
            )
          }
        >
          添加规则
        </Link>
      </View>
      {rules.map((r: any, i: number) => {
        const update = (next: any) =>
          change(
            rules.map((old: any) =>
              old.id === r.id ? { ...old, ...next } : old,
            ),
          );
        return (
          <View key={r.id} style={{ gap: 3 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <View style={{ flex: 1 }}>
                <Link onPress={() => setOpen(open === r.id ? "" : r.id)}>
                  {(open === r.id ? "▾ " : "› ") + (r.name || "新规则")}
                </Link>
              </View>
              <Switch
                accessibilityLabel={"启用规则 " + r.name}
                value={r.enabled}
                onValueChange={(v) => update({ enabled: v })}
              />
            </View>
            {open === r.id ? (
              <>
                <Copy quiet>规则名称</Copy>
                <FieldControl
                  field={{ key: "name", type: "text", label: "规则名称" }}
                  value={r.name}
                  change={(name) => update({ name })}
                />
                <Copy quiet>规则指令</Copy>
                <FieldControl
                  field={{
                    key: "instruction",
                    type: "long",
                    label: "规则指令",
                  }}
                  value={r.instruction}
                  change={(instruction) => update({ instruction })}
                />
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Link
                    onPress={() =>
                      insert(
                        {
                          ...r,
                          id: id(),
                          name: (r.name + " 副本").slice(0, 100),
                        },
                        i + 1,
                      )
                    }
                  >
                    复制规则
                  </Link>
                  <Link
                    onPress={() =>
                      change(rules.filter((x: any) => x.id !== r.id))
                    }
                  >
                    删除规则
                  </Link>
                </View>
              </>
            ) : (
              <Copy quiet>{r.instruction.slice(0, 100)}</Copy>
            )}
          </View>
        );
      })}
    </View>
  );
}
function Rows({
  field: f,
  value,
  change,
  labels = {},
  saved,
  sourceId,
}: Props) {
  const { confirm } = useSurface(),
    [open, setOpen] = useState(false);
  const rows: any[] = value || [],
    columns = f.columns || [],
    first = columns[0];
  if (!first) return null;
  const title = (r: any) =>
    r.name || labels[r[first.key]] || r[first.key] || "新条目";
  const add = () => {
    change([
      ...rows,
      Object.fromEntries(
        columns.map((c) => [
          c.key,
          c.type === "select" ? c.options?.[0]?.value : "",
        ]),
      ),
    ]);
    setOpen(true);
  };
  return (
    <View>
      {rows.length > 6 && (
        <Link onPress={() => setOpen(!open)}>
          {(open ? "▾ " : "› ") +
            rows.length +
            " 项 · " +
            rows.slice(0, 6).map(title).join("、")}
        </Link>
      )}
      {(open || rows.length <= 6) &&
        rows.map((r, i) => (
          <View key={i} style={{ gap: 2, paddingVertical: 5 }}>
            {columns.map((c) => (
              <View key={c.key}>
                <Copy quiet>{str(c.label)}</Copy>
                {c.key === first.key &&
                saved?.some((o: any) => o[first.key] === r[first.key]) ? (
                  <Copy>{labels[r[c.key]] || r[c.key]}</Copy>
                ) : (
                  <FieldControl
                    field={c}
                    value={r[c.key]}
                    labels={Object.fromEntries(
                      Object.entries(labels).filter(
                        ([id]) =>
                          id === r[c.key] ||
                          !rows.some((other) => other[first.key] === id),
                      ),
                    )}
                    change={(v) =>
                      change(
                        rows.map((row, j) =>
                          j === i ? { ...row, [c.key]: v } : row,
                        ),
                      )
                    }
                  />
                )}
              </View>
            ))}
            <Link onPress={() => change(rows.filter((_, j) => j !== i))}>
              移除条目
            </Link>
          </View>
        ))}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Link onPress={add}>添加条目</Link>
        {first.refresh && sourceId && (
          <Link
            onPress={() =>
              confirm("从来源刷新可选择的名称？", {
                kind: "refresh-labels",
                id: sourceId,
              })
            }
          >
            {str(first.refresh)}
          </Link>
        )}
      </View>
    </View>
  );
}
function Model({ value, change, models }: Props) {
  const groups = models?.groups || [],
    choices = groups.find((g: any) => g.id === value?.provider)?.models || [],
    efforts =
      choices.find((m: any) => m.id === value?.model)?.reasoning?.efforts || [];
  return (
    <View style={{ gap: 4 }}>
      {models?.default && (
        <Copy quiet>
          {"实例默认：" +
            models.default.provider +
            " / " +
            models.default.model}
        </Copy>
      )}
      {[
        ["provider", "服务商", groups],
        ["model", "模型", choices],
        ["reasoningEffort", "推理强度（可选）", efforts],
      ].map(([k, label, opts]: any) => {
        const put = (v: string) => {
          const next = { ...value, [k]: v };
          if (!next.reasoningEffort) delete next.reasoningEffort;
          change(Object.values(next).some(Boolean) ? next : null);
        };
        return (
          <View key={k}>
            <Copy quiet>{label}</Copy>
            <FieldControl
              field={{ key: k, type: "text", label }}
              value={value?.[k]}
              change={put}
            />
            {!!opts.length && (
              <Fold label={"选择" + label}>
                <Chips
                  items={Object.fromEntries(
                    opts.map((x: any) => [x.id, x.name || x.id]),
                  )}
                  active={value?.[k] || ""}
                  choose={put}
                />
              </Fold>
            )}
          </View>
        );
      })}
    </View>
  );
}
export function FieldControl(props: Props) {
  const { field: f, value, change, labels } = props,
    {
      theme: { colors },
    } = useSurface(),
    name = str(f.label) || f.key;
  if (f.type === "rules") return <Rules {...props} />;
  if (f.type === "policy") return <Policies {...props} />;
  if (f.type === "rows") return <Rows {...props} />;
  if (f.type === "model") return <Model {...props} />;
  if (f.type === "switch")
    return (
      <Switch
        accessibilityLabel={name}
        value={!!value}
        onValueChange={change}
      />
    );
  if (f.type === "select")
    return (
      <Chips
        items={Object.fromEntries(
          (f.options || []).map((o) => [o.value, str(o.label)]),
        )}
        active={String(value ?? f.options?.[0]?.value)}
        choose={change}
      />
    );
  if (f.choose && labels && Object.keys(labels).length)
    return (
      <Fold label={labels[value] || value || str(f.choose)}>
        <Chips
          items={{ "": "清空", ...labels }}
          active={value || ""}
          choose={change}
        />
      </Fold>
    );
  return (
    <TextInput
      accessibilityLabel={name}
      value={
        f.type === "commands" && Array.isArray(value)
          ? value.join(" ")
          : String(value ?? "")
      }
      onChangeText={change}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={f.type === "number" ? "numeric" : "default"}
      multiline={f.type === "long"}
      style={{
        minHeight: f.type === "long" ? 75 : 35,
        maxHeight: 190,
        padding: 7,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: colors.border,
        color: colors.foreground,
        fontSize: 13,
      }}
    />
  );
}
