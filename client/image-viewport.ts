import type { View } from "react-native";

type Slot = {
  node: View;
  visible: boolean;
  update: (visible: boolean) => void;
  top?: number;
  bottom?: number;
};

// Coordinates are relative to the transcript content, independent of the current scroll offset.
export class ImageViewport {
  private root: View | null = null;
  setRoot = (node: View | null) => {
    this.root = node;
    this.layoutChanged();
  };
  private slots = new Set<Slot>();
  private top = 0;
  private height = 0;
  private frame: number | undefined;
  private generation = 0;

  watch(node: View, update: Slot["update"]) {
    const slot: Slot = { node, update, visible: false };
    this.slots.add(slot);
    this.layoutChanged();
    return () => {
      this.slots.delete(slot);
    };
  }

  layoutChanged = () => {
    this.generation++;
    if (this.frame !== undefined || !this.slots.size) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      const root = this.root,
        generation = this.generation;
      if (!root) return;
      for (const slot of this.slots) {
        slot.node.measureLayout(root, (_x, y, _w, h) => {
          if (generation !== this.generation || !this.slots.has(slot)) return;
          slot.top = y;
          slot.bottom = y + h;
          this.check(slot);
        });
      }
    });
  };

  scroll(top: number, height: number) {
    this.top = Math.max(0, top);
    this.height = height;
    if (this.frame === undefined)
      for (const slot of this.slots) this.check(slot);
  }

  private check(slot: Slot) {
    const margin = 200;
    const visible =
      this.height > 0 &&
      slot.top !== undefined &&
      slot.bottom !== undefined &&
      slot.bottom >= this.top - margin &&
      slot.top <= this.top + this.height + margin;
    if (slot.visible !== visible) {
      slot.visible = visible;
      slot.update(visible);
    }
  }
}

// A started plugin RPC cannot be interrupted. Keep its slot until it actually settles.
let active = 0;
const waiting = new Set<() => void>();
export async function loadImage<T>(
  signal: AbortSignal,
  fetch: () => Promise<T>,
): Promise<T> {
  await new Promise<void>((resolve, reject) => {
    const start = () => {
      waiting.delete(start);
      signal.removeEventListener("abort", cancel);
      active++;
      resolve();
    };
    const cancel = () => {
      waiting.delete(start);
      reject(new Error("图片已离开可视区域"));
    };
    if (signal.aborted) cancel();
    else if (active < 3) start();
    else {
      waiting.add(start);
      signal.addEventListener("abort", cancel, { once: true });
    }
  });
  try {
    if (signal.aborted) throw new Error("图片已离开可视区域");
    return await fetch();
  } finally {
    active--;
    waiting.values().next().value?.();
  }
}
