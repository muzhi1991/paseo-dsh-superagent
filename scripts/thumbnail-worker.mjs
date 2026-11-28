// Bundled by build-thumbnail.mjs for Paseo's isolated server runtime.
import { parentPort, workerData } from "node:worker_threads";
import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon/node";
import { imageSize } from "image-size";

const { bytes, mime, edge } = workerData;
const { width, height, type, orientation } = imageSize(bytes);
const expected = mime === "image/jpeg" ? "jpg" : mime.slice(6);
if (type !== expected) throw Error("图片格式与附件记录不符");
if (!(width > 0 && height > 0 && width * height <= 24_000_000))
  throw Error("图片尺寸不适合生成缩略图");

const image = PhotonImage.new_from_byteslice(bytes);
const scale = Math.min(
  1,
  edge / Math.max(image.get_width(), image.get_height()),
);
const preview = resize(
  image,
  Math.max(1, Math.round(image.get_width() * scale)),
  Math.max(1, Math.round(image.get_height() * scale)),
  SamplingFilter.Triangle,
);
image.free();
const jpeg = preview.get_bytes_jpeg(75);
preview.free();
// Re-encoding drops EXIF. Preserve just the display orientation of phone photos.
if (orientation >= 2 && orientation <= 8) {
  const exif = Buffer.from(
    "ffe1002245786966000049492a0008000000010012010300010000000100000000000000",
    "hex",
  );
  exif.writeUInt16LE(orientation, 28);
  const oriented = new Uint8Array(jpeg.length + exif.length);
  oriented.set(jpeg.subarray(0, 2));
  oriented.set(exif, 2);
  oriented.set(jpeg.subarray(2), 2 + exif.length);
  parentPort.postMessage(oriented, [oriented.buffer]);
} else {
  parentPort.postMessage(jpeg, [jpeg.buffer]);
}
