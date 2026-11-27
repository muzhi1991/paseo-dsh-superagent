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
  options?: { label: any; value: string }[];
  columns?: Field[];
};
type Props = {
  field: Field;
  value: any;
  change: (v: any) => void;
  sources?: any[];
};
const cellNames: Record<string, string> = {
  listedUnaddressed: "名单内 · 未点名",
  unlistedAddressed: "名单外 · 已点名",
  unlistedUnaddressed: "名单外 · 未点名",
};
function Policies({ sources = [], value = {}, change }: Omit<Props, "field">) {
  const [selected, setSelected] = useState(""),
    available = sources.filter((s) => s.installed && s.policy);
  const s = available.find((s) => s.id === selected) || available[0];
  if (!s) return null;
  const part = value[s.id] || { allowed: [] },
    update = (key: string, v: any) =>
      change({ ...value, [s.id]: { ...part, [key]: v } });
  return (
    <View style={{ gap: 6 }}>
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
            value={part[f.key]}
            change={(v) => update(f.key, v)}
          />
        </View>
      ))}
      <Copy quiet>{str(s.policy.explicit)}</Copy>
      {s.policy.rows?.map((r: any) => (
        <Fold key={r.id} label={s.labels[r.id] || str(r.label)}>
          <Copy quiet>{str(r.note)}</Copy>
          {Object.keys(r.cells)
            .filter((k) => r.cells[k])
            .map((k) => (
              <View key={k}>
                <Copy>{cellNames[k]}</Copy>
                <Chips
                  active={
                    part.admission?.[r.id]?.[k] ||
                    (k === "listedUnaddressed" ? "inferred" : "ignore")
                  }
                  items={{
                    ignore: "忽略",
                    inferred: "推断",
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
        </Fold>
      ))}
    </View>
  );
}
export function FieldControl({ field: f, value, change, sources }: Props) {
  const {
      theme: { colors },
    } = useSurface(),
    name = str(f.label) || f.key;
  if (f.type === "policy")
    return <Policies sources={sources} value={value} change={change} />;
  if (f.type === "rows") {
    const rows: any[] = value || [],
      columns = f.columns || [];
    const add = () =>
      change([
        ...rows,
        Object.fromEntries(
          columns.map((c) => [
            c.key,
            c.type === "select"
              ? c.options?.[0]?.value
              : c.type === "switch"
                ? true
                : c.key === "id" && f.key === "rules"
                  ? "rule-" + Date.now().toString(36)
                  : "",
          ]),
        ),
      ]);
    return (
      <View style={{ gap: 5 }}>
        {rows.map((r, i) => (
          <Fold
            key={i}
            label={
              str(r.name || r.title || r.id || Object.values(r)[0]) || "新条目"
            }
          >
            {columns.map((c) => (
              <View key={c.key}>
                <Copy quiet>{str(c.label) || c.key}</Copy>
                <FieldControl
                  field={c}
                  value={r[c.key]}
                  change={(v) =>
                    change(
                      rows.map((row, j) =>
                        j === i ? { ...row, [c.key]: v } : row,
                      ),
                    )
                  }
                />
              </View>
            ))}
            <Link onPress={() => change(rows.filter((_, j) => j !== i))}>
              移除条目
            </Link>
          </Fold>
        ))}
        <Link onPress={add}>添加条目</Link>
      </View>
    );
  }
  if (f.type === "model")
    return (
      <View>
        {[
          ["provider", "提供商"],
          ["model", "模型名称"],
          ["reasoningEffort", "推理强度"],
        ].map(([k, label]) => (
          <View key={k}>
            <Copy quiet>{label}</Copy>
            <FieldControl
              field={{ key: k, type: "text", label }}
              value={value?.[k]}
              change={(v) => {
                const next = { ...value, [k]: v };
                if (!next.reasoningEffort) delete next.reasoningEffort;
                change(Object.values(next).some(Boolean) ? next : null);
              }}
            />
          </View>
        ))}
      </View>
    );
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
        active={String(value)}
        choose={change}
      />
    );
  const multiline = ["json", "long"].includes(f.type);
  return (
    <TextInput
      accessibilityLabel={name}
      value={
        f.type === "json" && typeof value !== "string"
          ? JSON.stringify(value ?? null, null, 2)
          : String(value ?? "")
      }
      onChangeText={change}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={f.type === "number" ? "numeric" : "default"}
      multiline={multiline}
      style={{
        minHeight: multiline ? 75 : 35,
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
