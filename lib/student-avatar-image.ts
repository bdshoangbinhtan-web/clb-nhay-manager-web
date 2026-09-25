export const AVATAR_SIZE = 800;
export const AVATAR_JPEG_QUALITY = 0.85;
export const AVATAR_WORKING_MAX = 1920;

export type AvatarProcessingStep =
  | "decode"
  | "crop"
  | "blob-export"
  | "storage-upload"
  | "avatar-url-refresh";

export class StudentAvatarError extends Error {
  readonly step: AvatarProcessingStep;

  constructor(
    step: AvatarProcessingStep,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "StudentAvatarError";
    this.step = step;
  }
}

export function avatarErrorStep(error: unknown): AvatarProcessingStep | "unknown" {
  return error instanceof StudentAvatarError ? error.step : "unknown";
}

export type PreparedAvatarImage = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  cleanup: () => void;
};

export type AvatarCrop = { centerX: number; centerY: number; zoom: number };

export function sourceCropRect(width: number, height: number, crop: AvatarCrop) {
  const size = Math.min(width, height) / Math.max(1, crop.zoom);
  const x = Math.max(0, Math.min(width - size, crop.centerX - size / 2));
  const y = Math.max(0, Math.min(height - size, crop.centerY - size / 2));
  return { x, y, size };
}

export function avatarErrorDetails(error: unknown) {
  const step = avatarErrorStep(error);
  return error instanceof Error
    ? { step, name: error.name, message: error.message }
    : { step, message: String(error) };
}

function logAvatar(event: string, details: Record<string, unknown>) {
  console.info(`[student-avatar] ${event}`, details);
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new StudentAvatarError(
            "blob-export",
            "Trình duyệt không xuất được ảnh JPEG sau khi cắt.",
          ));
          return;
        }
        resolve(blob);
      }, type, quality);
    } catch (error) {
      reject(new StudentAvatarError(
        "blob-export",
        "Trình duyệt gặp lỗi khi xuất ảnh JPEG sau khi cắt.",
        { cause: error },
      ));
    }
  });
}

function fileLooksLikeSupportedImage(file: File) {
  const mime = file.type.trim().toLowerCase();
  if (!mime || mime.startsWith("image/")) return true;

  // Some iOS/WebView versions expose camera images as an empty or generic MIME.
  // In that case the browser decoder, rather than metadata, is authoritative.
  return mime === "application/octet-stream"
    && /\.(?:jpe?g|png|webp|hei[cf])$/i.test(file.name);
}

function isSafariBrowser() {
  const agent = navigator.userAgent;
  return /safari/i.test(agent) && !/(chrome|crios|android|fxios|edgios)/i.test(agent);
}

async function decodeWithImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("HTMLImageElement không đọc được ảnh."));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Ảnh không có kích thước hợp lệ.");
    }
    return {
      image,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function prepareAvatarImage(file: File): Promise<PreparedAvatarImage> {
  logAvatar("input", {
    userAgent: navigator.userAgent,
    fileName: file.name || "(empty)",
    fileType: file.type || "(empty)",
    fileSize: file.size,
  });

  if (!fileLooksLikeSupportedImage(file)) {
    throw new StudentAvatarError(
      "decode",
      "Định dạng ảnh không được hỗ trợ. Hãy chụp ảnh mới hoặc chọn ảnh JPG, PNG, WebP, HEIC/HEIF.",
    );
  }

  let source: CanvasImageSource;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let cleanupSource = () => {};
  let decodeMethod = "html-image";

  try {
    const canUseBitmap = typeof createImageBitmap === "function" && !isSafariBrowser();
    if (canUseBitmap) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        source = bitmap;
        sourceWidth = bitmap.width;
        sourceHeight = bitmap.height;
        cleanupSource = () => bitmap.close();
        decodeMethod = "create-image-bitmap";
      } catch (bitmapError) {
        console.warn("[student-avatar] createImageBitmap failed; using HTMLImageElement fallback", avatarErrorDetails(bitmapError));
        const decoded = await decodeWithImageElement(file);
        const image = decoded.image;
        source = image;
        sourceWidth = image.naturalWidth;
        sourceHeight = image.naturalHeight;
        cleanupSource = decoded.cleanup;
      }
    } else {
      const decoded = await decodeWithImageElement(file);
      const image = decoded.image;
      source = image;
      sourceWidth = image.naturalWidth;
      sourceHeight = image.naturalHeight;
      cleanupSource = decoded.cleanup;
    }
  } catch (error) {
    console.error("[student-avatar] decode failed", avatarErrorDetails(error));
    throw new StudentAvatarError(
      "decode",
      "Thiết bị chưa giải mã được ảnh này. Hãy chụp ảnh mới hoặc chọn ảnh JPG/PNG.",
      { cause: error },
    );
  }

  logAvatar("decoded", {
    decodeMethod,
    naturalWidth: sourceWidth,
    naturalHeight: sourceHeight,
  });

  const ratio = Math.min(1, AVATAR_WORKING_MAX / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * ratio));
  const height = Math.max(1, Math.round(sourceHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    cleanupSource();
    throw new StudentAvatarError("decode", "Thiết bị không tạo được vùng xử lý ảnh.");
  }

  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
  } catch (error) {
    canvas.width = 1;
    canvas.height = 1;
    throw new StudentAvatarError(
      "decode",
      "Thiết bị không đưa được ảnh vào vùng xử lý.",
      { cause: error },
    );
  } finally {
    cleanupSource();
  }

  logAvatar("working-canvas", { width, height });
  return {
    canvas,
    width,
    height,
    cleanup: () => {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}

export async function processStudentAvatar(image: PreparedAvatarImage, crop: AvatarCrop) {
  const output = document.createElement("canvas");
  output.width = AVATAR_SIZE;
  output.height = AVATAR_SIZE;
  const context = output.getContext("2d", { alpha: false });
  if (!context) {
    throw new StudentAvatarError("crop", "Thiết bị không tạo được vùng cắt ảnh.");
  }

  const source = sourceCropRect(image.width, image.height, crop);
  try {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image.canvas,
      source.x,
      source.y,
      source.size,
      source.size,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
  } catch (error) {
    output.width = 1;
    output.height = 1;
    throw new StudentAvatarError(
      "crop",
      "Thiết bị không cắt được vùng ảnh đã chọn.",
      { cause: error },
    );
  }

  try {
    const blob = await canvasToBlob(output, "image/jpeg", AVATAR_JPEG_QUALITY);
    if (blob.type !== "image/jpeg") {
      throw new StudentAvatarError(
        "blob-export",
        `Trình duyệt trả về định dạng không hợp lệ: ${blob.type || "(empty)"}.`,
      );
    }
    logAvatar("cropped-blob", {
      croppedBlobType: blob.type,
      croppedBlobSize: blob.size,
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
    });
    return blob;
  } finally {
    output.width = 1;
    output.height = 1;
  }
}
