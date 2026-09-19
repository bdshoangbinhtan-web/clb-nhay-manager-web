"use client";

/* eslint-disable @next/next/no-img-element -- local object URLs must never leave the browser */

import { useEffect, useRef, useState } from "react";
import { AvatarCrop, PreparedAvatarImage, prepareAvatarImage, processStudentAvatar, sourceCropRect } from "@/lib/student-avatar-image";

type FaceDetectorShape = { detect: (input: CanvasImageSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>> };
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorShape;

type Props = {
  file: File;
  onCancel: () => void;
  onRetake: (file: File) => void;
  onSave: (blob: Blob) => Promise<void>;
};

export function StudentAvatarEditor({ file, onCancel, onRetake, onSave }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<PreparedAvatarImage | null>(null);
  const [preview, setPreview] = useState("");
  const [crop, setCrop] = useState<AvatarCrop>({ centerX: 0, centerY: 0, zoom: 1 });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"idle" | "optimizing" | "saving" | "failed">("idle");
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinch = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    let prepared: PreparedAvatarImage | null = null;
    void prepareAvatarImage(file).then(async (next) => {
      if (!active) { next.cleanup(); return; }
      prepared = next;
      let initial: AvatarCrop = { centerX: next.width / 2, centerY: next.height / 2, zoom: 1 };
      const FaceDetector = (window as typeof window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
      if (!FaceDetector) setMessage("Chưa tự căn được khuôn mặt. Kéo hoặc zoom ảnh để căn lại.");
      else {
        try {
          const faces = await new FaceDetector({ fastMode: true, maxDetectedFaces: 3 }).detect(next.canvas);
          if (faces.length === 1) {
            const face = faces[0].boundingBox;
            const desiredSize = Math.max(face.width / .55, face.height / .62);
            initial = { centerX: face.x + face.width / 2, centerY: face.y + face.height * .68, zoom: Math.max(1, Math.min(4, Math.min(next.width, next.height) / desiredSize)) };
          } else if (faces.length > 1) setMessage("Ảnh có nhiều khuôn mặt. Kéo ảnh để chọn đúng bé.");
          else setMessage("Chưa tự căn được khuôn mặt. Kéo hoặc zoom ảnh để căn lại.");
        } catch { setMessage("Chưa tự căn được khuôn mặt. Kéo hoặc zoom ảnh để căn lại."); }
      }
      if (active) { setCrop(initial); setImage(next); }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Không thể đọc ảnh."));
    return () => { active = false; prepared?.cleanup(); };
  }, [file]);

  useEffect(() => {
    if (!image) return;
    let url = "";
    image.canvas.toBlob((blob) => {
      if (!blob) return;
      url = URL.createObjectURL(blob);
      setPreview(url);
    }, "image/webp", .72);
    return () => { if (url) URL.revokeObjectURL(url); setPreview(""); };
  }, [image]);
  const view = image ? sourceCropRect(image.width, image.height, crop) : null;

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !image || !view) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 2) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (lastPinch.current) setCrop((value) => ({ ...value, zoom: Math.max(1, Math.min(4, value.zoom * distance / lastPinch.current!)) }));
      lastPinch.current = distance;
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const factor = view.size / rect.width;
      setCrop((value) => ({ ...value, centerX: value.centerX - (event.clientX - previous.x) * factor, centerY: value.centerY - (event.clientY - previous.y) * factor }));
    }
  }

  async function save() {
    if (!image || stage === "optimizing" || stage === "saving") return;
    setError(""); setStage("optimizing");
    try { const blob = await processStudentAvatar(image, crop); setStage("saving"); await onSave(blob); }
    catch { setStage("failed"); setError("Chưa lưu được ảnh. Ảnh cũ vẫn được giữ."); }
  }

  return <div className="ui-modal-backdrop p-0 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="avatar-editor-title">
    <section className="ui-modal flex max-h-[100dvh] w-full max-w-lg flex-col overflow-y-auto rounded-none p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-h-[calc(100vh-40px)] sm:rounded-[28px] sm:p-6">
      <h2 id="avatar-editor-title" className="text-xl font-black">Căn ảnh đại diện</h2>
      {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      {message ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{message}</p> : null}
      <div className="relative mx-auto mt-4 aspect-square w-full max-w-[min(78vw,360px)] touch-none overflow-hidden rounded-3xl bg-slate-100 shadow-inner" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); }} onPointerMove={pointerMove} onPointerUp={(event) => { pointers.current.delete(event.pointerId); lastPinch.current = null; }} onPointerCancel={(event) => { pointers.current.delete(event.pointerId); lastPinch.current = null; }}>
        {image && view && preview ? <img src={preview} alt="Xem trước vùng cắt" draggable={false} className="absolute max-w-none select-none" style={{ width: `${image.width / view.size * 100}%`, height: `${image.height / view.size * 100}%`, left: `${-view.x / view.size * 100}%`, top: `${-view.y / view.size * 100}%` }} /> : <div className="flex h-full items-center justify-center text-sm text-slate-500">Đang đọc ảnh…</div>}
      </div>
      <label className="mt-4 block text-sm font-bold">Thu phóng
        <input className="mt-2 h-11 w-full accent-blue-600" aria-label="Thu phóng ảnh" type="range" min="1" max="4" step="0.01" value={crop.zoom} onChange={(event) => setCrop((value) => ({ ...value, zoom: Number(event.target.value) }))} />
      </label>
      <p className="text-center text-xs text-slate-500">Kéo bằng một ngón tay · Chụm hai ngón để thu phóng</p>
      {stage === "optimizing" ? <p className="mt-3 text-center font-bold text-blue-700">Đang tối ưu ảnh...</p> : null}
      {stage === "saving" ? <p className="mt-3 text-center font-bold text-blue-700">Đang lưu ảnh...</p> : null}
      <div className="mt-5 grid grid-cols-3 gap-2">
        <button type="button" className="ui-btn min-h-12 border border-slate-200" disabled={stage === "optimizing" || stage === "saving"} onClick={() => cameraRef.current?.click()}>Chụp lại</button>
        <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => { const next = event.target.files?.[0]; if (next) onRetake(next); event.currentTarget.value = ""; }} />
        <button type="button" className="ui-btn min-h-12 border border-slate-200" disabled={stage === "optimizing" || stage === "saving"} onClick={onCancel}>Hủy</button>
        <button type="button" className="ui-btn ui-btn-primary min-h-12" disabled={!image || stage === "optimizing" || stage === "saving"} onClick={() => void save()}>{stage === "failed" ? "Thử lại" : "Dùng ảnh"}</button>
      </div>
    </section>
  </div>;
}
