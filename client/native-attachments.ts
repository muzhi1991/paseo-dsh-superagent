import {
  attachment,
  checkCount,
  checkSize,
  type AttachmentAction,
} from "./attachments.ts";

type Selection<T> = { canceled: true } | { canceled: false; assets: T[] };
type DocumentAsset = {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
};
type PhotoAsset = { fileName?: string; base64?: string };

// Paseo already links these Expo modules on iOS and Android. Plugin bundles
// share the app's Expo runtime, but cannot import its JS picker packages.
type DeviceModules = {
  ExpoDocumentPicker?: {
    getDocumentAsync(options: {
      type: string[];
      multiple: boolean;
      copyToCacheDirectory: boolean;
    }): Promise<Selection<DocumentAsset>>;
  };
  ExponentFileSystem?: {
    getInfoAsync(
      uri: string,
      options: { size: boolean },
    ): Promise<{ size?: number }>;
    readAsStringAsync(
      uri: string,
      options: { encoding: "base64" },
    ): Promise<string>;
  };
  ExponentImagePicker?: {
    launchImageLibraryAsync(options: {
      mediaTypes: string[];
      base64: boolean;
      quality: number;
    }): Promise<Selection<PhotoAsset>>;
  };
  ExpoClipboard?: {
    hasImageAsync(): Promise<boolean>;
    getImageAsync(options: { format: "png" }): Promise<{ data: string } | null>;
  };
};
function deviceModules(): DeviceModules {
  return (
    (globalThis as { expo?: { modules?: DeviceModules } }).expo?.modules ?? {}
  );
}
export async function pickNative(
  action: AttachmentAction,
  remaining: number,
  modules = deviceModules(),
) {
  checkCount(1, remaining);
  const unavailable =
    "此版本的 Paseo 未提供这项设备功能，请更新客户端或使用手机浏览器。";
  if (action === "paste") {
    const clipboard = modules.ExpoClipboard;
    if (!clipboard) throw Error(unavailable);
    const image =
      (await clipboard.hasImageAsync()) &&
      (await clipboard.getImageAsync({ format: "png" }));
    if (!image) throw Error("剪贴板里没有图片");
    return [
      attachment(
        "clipboard.png",
        image.data.replace(/^data:image\/png;base64,/i, ""),
        "image/png",
      ),
    ];
  }
  if (action === "image") {
    const picker = modules.ExponentImagePicker;
    if (!picker) throw Error(unavailable);
    // Expo exports the picked photo as JPEG, including HEIC photos on iOS.
    const result = await picker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.8,
    });
    if (result.canceled) return [];
    return result.assets.map((photo) => {
      if (!photo.base64) throw Error("无法读取所选图片");
      const name = (photo.fileName || "photo").replace(/\.[^.]+$/, "");
      return attachment(name + ".jpg", photo.base64, "image/jpeg");
    });
  }
  const picker = modules.ExpoDocumentPicker,
    fs = modules.ExponentFileSystem;
  if (!picker || !fs) throw Error(unavailable);
  const result = await picker.getDocumentAsync({
    type: ["*/*"],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  checkCount(result.assets.length, remaining);
  return Promise.all(
    result.assets.map(async (file) => {
      const size =
        file.size ?? (await fs.getInfoAsync(file.uri, { size: true })).size;
      if (size === undefined) throw Error("无法读取文件大小");
      checkSize(size);
      return attachment(
        file.name,
        await fs.readAsStringAsync(file.uri, { encoding: "base64" }),
        file.mimeType,
      );
    }),
  );
}
