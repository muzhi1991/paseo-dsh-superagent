import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function boundAgent(
  url: string,
  stateDir: unknown,
  ticket: string,
) {
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) ||
    typeof stateDir !== "string" ||
    !/^[-\w]+$/.test(ticket)
  )
    return;
  try {
    const binding = JSON.parse(
      await readFile(
        join(stateDir, "paseo-bindings", ticket + ".json"),
        "utf8",
      ),
    );
    return typeof binding?.agentId === "string"
      ? (binding.agentId as string)
      : undefined;
  } catch {
    // An optional local Paseo binding must never hide the DSH ticket itself.
    return;
  }
}
