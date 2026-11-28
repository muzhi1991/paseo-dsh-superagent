import { test } from "node:test";
import assert from "node:assert/strict";
import { imageUri } from "../client/image-uri.ts";
import { fitsPreview } from "../shared/image.ts";

test("only small images with known dimensions can reuse original bytes inline", () => {
  const small = { width: 512, height: 350, bytes: 65_536 };
  assert.ok(fitsPreview(small));
  for (const change of [
    { bytes: 65_537 },
    { height: 513 },
    { width: undefined },
    { bytes: undefined },
  ])
    assert.equal(fitsPreview({ ...small, ...change }), false);
});

test("native image URIs preserve wire bytes across chunk boundaries and padding", () => {
  for (const [signature, mime] of [
    [0xff, "jpeg"],
    [0x89, "png"],
    [0x47, "gif"],
    [0x52, "webp"],
  ]) {
    for (const length of [1, 2, 3, 12_287, 12_288, 12_289]) {
      const bytes = Uint8Array.from({ length }, (_, i) => i % 255);
      bytes[0] = signature;
      Object.defineProperty(bytes, "toBase64", { value: undefined });
      assert.equal(
        imageUri(bytes),
        "data:image/" +
          mime +
          ";base64," +
          Buffer.from(bytes).toString("base64"),
      );
    }
  }
});

test("the bundled encoder returns a smaller JPEG preview for a large PNG", async () => {
  const { readFile } = await import("node:fs/promises");
  const { renderThumbnail } = await import("../server/thumbnail.ts");
  const source = await readFile(
    new URL("../assets/desktop-overview.png", import.meta.url),
  );
  const preview = await renderThumbnail(source, "image/png");
  assert.equal(preview.readUInt16BE(0), 0xffd8);
  assert.ok(preview.length < source.length);
  const { imageSize } = await import("image-size");
  assert.equal(imageSize(preview).width, 512);
  // A portrait phone photo with EXIF orientation 6 (90 degrees clockwise).
  const exif = Buffer.from(
    "ffe1002245786966000049492a0008000000010012010300010000000600000000000000",
    "hex",
  );
  const portrait = Buffer.concat([
    preview.subarray(0, 2),
    exif,
    preview.subarray(2),
  ]);
  const portraitPreview = await renderThumbnail(portrait, "image/jpeg");
  assert.equal(imageSize(portraitPreview).orientation, 6);
});

test("corrupt input doesn't block subsequent GIF and WebP previews", async () => {
  const { renderThumbnail } = await import("../server/thumbnail.ts");
  const failed = renderThumbnail(Buffer.from("broken"), "image/png");
  const gif = renderThumbnail(
    Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
    "image/gif",
  );
  const webp = renderThumbnail(
    Buffer.from(
      "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
      "base64",
    ),
    "image/webp",
  );
  await assert.rejects(failed);
  for (const preview of await Promise.all([gif, webp]))
    assert.equal(preview.readUInt16BE(0), 0xffd8);
});
