import assert from "node:assert/strict";
import test from "node:test";
import { pickNative } from "../client/native-attachments.ts";

test("photos use the picker's JPEG bytes and keep the original file stem", async () => {
  const modules = {
    ExponentImagePicker: {
      async launchImageLibraryAsync(options) {
        assert.deepEqual(options.mediaTypes, ["images"]);
        assert.equal(options.base64, true);
        return {
          canceled: false,
          assets: [{ fileName: "我的照片.heic", base64: "/9j/" }],
        };
      },
    },
  };
  assert.deepEqual(await pickNative("image", 1, modules), [
    { name: "我的照片.jpg", data: "/9j/", mediaType: "image/jpeg" },
  ]);
});

test("pasting reads PNG only on request and handles an empty clipboard", async () => {
  const clipboard = {
    hasImageAsync: async () => true,
    getImageAsync: async ({ format }) => ({
      data: "data:image/" + format + ";base64,YQ==",
    }),
  };
  const modules = { ExpoClipboard: clipboard };
  assert.deepEqual(await pickNative("paste", 1, modules), [
    { name: "clipboard.png", data: "YQ==", mediaType: "image/png" },
  ]);
  clipboard.hasImageAsync = async () => false;
  await assert.rejects(pickNative("paste", 1, modules), /剪贴板里没有图片/);
});

test("native file picker reads cache copies, enforces limits and handles cancellation", async () => {
  let result = {
    canceled: false,
    assets: [{ name: "note.txt", uri: "file:///cache/note" }],
  };
  let reads = 0;
  const modules = {
    ExpoDocumentPicker: {
      getDocumentAsync: async (options) => {
        assert.equal(options.copyToCacheDirectory, true);
        return result;
      },
    },
    ExponentFileSystem: {
      getInfoAsync: async () => ({ size: 1 }),
      readAsStringAsync: async (_, options) => {
        assert.equal(options.encoding, "base64");
        reads++;
        return "YQ==";
      },
    },
  };
  assert.deepEqual(await pickNative("file", 1, modules), [
    { name: "note.txt", data: "YQ==" },
  ]);
  result.assets[0].size = 2097153;
  await assert.rejects(pickNative("file", 1, modules), /2 MiB/);
  await assert.rejects(pickNative("file", 0, modules), /最多 12/);
  result = { canceled: true };
  assert.deepEqual(await pickNative("file", 1, modules), []);
  assert.equal(reads, 1);
});
