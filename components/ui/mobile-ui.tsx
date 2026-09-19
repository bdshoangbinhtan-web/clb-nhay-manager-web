"use client";

import Link from "next/link";
import { useEffect, useId, type ReactNode } from "react";

export function MobilePageShell({ children }: { children: ReactNode }) {
  return <div className="abk-mobile-page lg:hidden">{children}</div>;
}

export function MobilePageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="abk-page-header"><div className="min-w-0">{eyebrow ? <p className="abk-eyebrow">{eyebrow}</p> : null}<h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{action ? <div className="shrink-0">{action}</div> : null}</header>;
}

export function MobileListRow({ href, leading, title, subtitle, meta, status }: { href: string; leading?: ReactNode; title: string; subtitle?: string; meta?: ReactNode; status?: ReactNode }) {
  return <Link href={href} className="abk-list-row">{leading ? <span className="abk-list-leading">{leading}</span> : null}<span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-extrabold text-slate-900">{title}</span>{subtitle ? <span className="mt-1 block truncate text-[13px] font-medium text-slate-500">{subtitle}</span> : null}{status ? <span className="mt-2 block">{status}</span> : null}</span>{meta ? <span className="shrink-0 text-right">{meta}</span> : null}<span aria-hidden="true" className="abk-list-chevron">›</span></Link>;
}

export function BottomSheet({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="abk-sheet-layer lg:hidden"><button className="abk-sheet-backdrop" onClick={onClose} aria-label="Đóng" /><section className="abk-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="abk-sheet-handle" aria-hidden="true" /><div className="flex items-start justify-between gap-4 px-5 pb-3"><div><h2 id={titleId} className="text-lg font-black text-slate-950">{title}</h2>{description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}</div><button type="button" onClick={onClose} className="abk-icon-button" aria-label="Đóng">×</button></div><div className="max-h-[70dvh] overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div></section></div>;
}

export function Skeleton({ className = "h-16" }: { className?: string }) { return <div className={`abk-skeleton ${className}`} aria-hidden="true" />; }
export function EmptyState({ icon = "✓", title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) { return <div className="abk-empty-state"><span className="text-2xl" aria-hidden="true">{icon}</span><h3>{title}</h3>{description ? <p>{description}</p> : null}{action}</div>; }
export function InlineState({ type, title, children }: { type: "success" | "error"; title: string; children?: ReactNode }) { return <div className={`abk-inline-state abk-inline-${type}`} role={type === "error" ? "alert" : "status"}><span aria-hidden="true">{type === "success" ? "✓" : "!"}</span><div><strong>{title}</strong>{children ? <div>{children}</div> : null}</div></div>; }
export function PrimaryBottomAction({ children }: { children: ReactNode }) { return <div className="abk-bottom-action">{children}</div>; }
export function FilterChip({ active = false, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) { return <button type="button" className={`abk-filter-chip ${active ? "is-active" : ""}`} onClick={onClick}>{children}</button>; }
export function ConfirmationPanel({ title, description, confirmLabel, onConfirm, onCancel, dangerous = false }: { title: string; description: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; dangerous?: boolean }) { return <div className="p-2"><h3 className="text-base font-black text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" className="abk-secondary-button" onClick={onCancel}>Quay lại</button><button type="button" className={dangerous ? "abk-danger-button" : "abk-primary-button"} onClick={onConfirm}>{confirmLabel}</button></div></div>; }
