"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Expand, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui";

export function useVideoKeyboardSeek(videoRef: RefObject<HTMLVideoElement | null>, seekTo: (seconds: number) => void, enabled = true) {
  const seekRef = useRef(seekTo);
  seekRef.current = seekTo;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!enabled || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const video = videoRef.current;
      if (!video) return;
      event.preventDefault();
      seekRef.current(video.currentTime + (event.key === "ArrowLeft" ? -5 : 5));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, videoRef]);
}

export function VideoFullscreenButton({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === targetRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [targetRef]);

  async function toggle() {
    if (!targetRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await targetRef.current.requestFullscreen();
  }

  const label = fullscreen ? "Exit fullscreen" : "Fullscreen video and moments";
  return <Button size="icon" className="h-8 w-8" title={label} aria-label={label} onClick={() => void toggle()}>{fullscreen ? <Minimize2 size={14} /> : <Expand size={14} />}</Button>;
}
