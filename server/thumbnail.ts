import { Worker } from "node:worker_threads";
import workerLines from "./generated/thumbnail-worker.json" with { type: "json" };
import { previewEdge, type ImageMediaType } from "../shared/image.ts";

let source: string | undefined;
let previous: Promise<void> = Promise.resolve();

async function encode(bytes: Buffer, mime: ImageMediaType) {
  source ??= workerLines.join("\n");
  const worker = new Worker(source, {
    eval: true,
    execArgv: [],
    workerData: { bytes, mime, edge: previewEdge },
  });
  let timer: NodeJS.Timeout | undefined;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      timer = setTimeout(() => reject(Error("缩略图生成超时")), 12_000);
      worker.once("message", (jpeg: Uint8Array) =>
        resolve(Buffer.from(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength)),
      );
      worker.once("error", reject);
      worker.once("exit", () => reject(Error("缩略图生成中止")));
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}

export function renderThumbnail(bytes: Buffer, mime: ImageMediaType) {
  // Keep image decoding off the subscription event loop and bound concurrent pixel buffers.
  const job = previous.then(() => encode(bytes, mime));
  previous = job.then(
    () => {},
    () => {},
  );
  return job;
}
