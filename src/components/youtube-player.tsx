"use client";

import { useEffect, useId, useRef } from "react";

import { getYouTubeVideoId } from "@/lib/external-video";

type YouTubePlayerApi = {
  destroy(): void;
  getCurrentTime(): number;
  mute(): void;
  unMute(): void;
  playVideo(): void;
};

type YouTubeNamespace = {
  Player: new (elementId: string, options: {
    videoId: string;
    playerVars: Record<string, number>;
    events: { onReady(event: { target: YouTubePlayerApi }): void };
  }) => YouTubePlayerApi;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error("YouTube player API did not load."));
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("YouTube player API could not be loaded."));
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

export function YouTubePlayer({ url, soundEnabled, onTimeUpdate }: { url: string; soundEnabled: boolean; onTimeUpdate: (seconds: number) => void }) {
  const rawId = useId();
  const elementId = `youtube-${rawId.replace(/:/g, "")}`;
  const playerRef = useRef<YouTubePlayerApi | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return;
    void loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(elementId, {
        videoId,
        playerVars: { autoplay: 1, controls: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: ({ target }) => {
            if (soundEnabledRef.current) target.unMute(); else target.mute();
            target.playVideo();
            timer = window.setInterval(() => onTimeUpdateRef.current(Math.max(0, target.getCurrentTime() || 0)), 250);
          },
        },
      });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [elementId, url]);

  useEffect(() => {
    if (soundEnabled) playerRef.current?.unMute(); else playerRef.current?.mute();
  }, [soundEnabled]);

  return <div id={elementId} className="h-full w-full" />;
}
