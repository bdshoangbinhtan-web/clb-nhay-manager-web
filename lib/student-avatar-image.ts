export const AVATAR_SIZE = 320;
export const AVATAR_WEBP_QUALITY = 0.78;
export const AVATAR_WORKING_MAX = 1920;

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

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không thể xử lý ảnh.")), type, quality);
  });
}

export async function prepareAvatarImage(file: File): Promise<PreparedAvatarImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error("Thiết bị chưa đọc được định dạng ảnh này. Hãy chụp ảnh mới hoặc chọn ảnh JPG/PNG.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Thiết bị chưa đọc được định dạng ảnh này. Hãy chụp ảnh mới hoặc chọn ảnh JPG/PNG.");
  }
  const ratio = Math.min(1, AVATAR_WORKING_MAX / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) { bitmap.close(); throw new Error("Không thể xử lý ảnh."); }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { canvas, width, height, cleanup: () => { canvas.width = 1; canvas.height = 1; } };
}

export async function processStudentAvatar(image: PreparedAvatarImage, crop: AvatarCrop) {
  const output = document.createElement("canvas");
  output.width = AVATAR_SIZE;
  output.height = AVATAR_SIZE;
  const context = output.getContext("2d", { alpha: false });
  if (!context) throw new Error("Không thể tối ưu ảnh.");
  const source = sourceCropRect(image.width, image.height, crop);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image.canvas, source.x, source.y, source.size, source.size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  const blob = await canvasToBlob(output, "image/webp", AVATAR_WEBP_QUALITY);
  output.width = 1;
  output.height = 1;
  if (blob.type !== "image/webp") throw new Error("Trình duyệt chưa hỗ trợ xuất ảnh WebP.");
  return blob;
}
