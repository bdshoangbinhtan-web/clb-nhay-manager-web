"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { usePrivacyView } from "./privacy-view-context";

const HOLD_DURATION_MS = 2000;

export function usePrivacyLogoGesture() {
  const { role, togglePrivacyView } = usePrivacyView();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  function cancelHold() {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    pointerIdRef.current = null;
  }

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (role !== "admin" && role !== "manager") return;
    if (!event.isPrimary || event.button !== 0 || pointerIdRef.current !== null) return;
    suppressClickRef.current = false;
    pointerIdRef.current = event.pointerId;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      suppressClickRef.current = true;
      togglePrivacyView();
    }, HOLD_DURATION_MS);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerId !== pointerIdRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) {
      cancelHold();
    }
  }

  function onPointerEnd(event: PointerEvent<HTMLElement>) {
    if (event.pointerId === pointerIdRef.current) cancelHold();
  }

  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function onContextMenu(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerLeave: onPointerEnd,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onClickCapture,
    onContextMenu,
  };
}
