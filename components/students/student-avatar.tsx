"use client";

/* eslint-disable @next/next/no-img-element -- signed private 320px objects intentionally bypass Next image optimization */

import { useEffect, useRef, useState } from "react";

type Props = {
  name: string;
  url?: string | null;
  size?: "list" | "detail";
  editable?: boolean;
  onPhotoSelected?: (file: File) => void;
};

export function StudentAvatar({ name, url, size = "list", editable = false, onPhotoSelected }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const dimensions = size === "detail" ? "h-20 w-20 sm:h-24 sm:w-24" : "h-12 w-12 sm:h-16 sm:w-16 lg:h-12 lg:w-12";

  function selected(file?: File) {
    if (file) onPhotoSelected?.(file);
  }

  const visual = <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 via-white to-indigo-100 text-2xl shadow-[inset_0_1px_0_white,0_8px_18px_rgba(50,80,130,.10)] ${dimensions}`}>
    {url && !broken ? <img src={url} alt={`Ảnh đại diện ${name}`} width={size === "detail" ? 96 : 64} height={size === "detail" ? 96 : 64} loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setBroken(true)} /> : <span aria-label="Chưa có ảnh đại diện">👤</span>}
    {editable ? <span aria-hidden="true" className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-tl-xl bg-blue-600 text-sm text-white">📷</span> : null}
  </span>;

  if (!editable) return visual;
  return <div className="flex shrink-0 flex-col items-center gap-1">
    <button type="button" className="rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" aria-label="Chụp ảnh đại diện" onClick={() => cameraRef.current?.click()}>{visual}</button>
    <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => { selected(event.target.files?.[0]); event.currentTarget.value = ""; }} />
    <input ref={galleryRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { selected(event.target.files?.[0]); event.currentTarget.value = ""; }} />
    <button type="button" className="min-h-11 px-1 text-[11px] font-bold text-blue-700" onClick={() => galleryRef.current?.click()}>Chọn ảnh có sẵn</button>
  </div>;
}
