"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui";

const storageKey = "live-game-sound-enabled";
const changeEvent = "live-game-sound-change";

export function useSoundPreference() {
  const [soundEnabled, setSoundEnabledState] = useState(false);
  useEffect(() => {
    setSoundEnabledState(window.localStorage.getItem(storageKey) === "1");
    const sync = (event: Event) => setSoundEnabledState(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(changeEvent, sync);
    return () => window.removeEventListener(changeEvent, sync);
  }, []);
  function setSoundEnabled(enabled: boolean) {
    setSoundEnabledState(enabled);
    window.localStorage.setItem(storageKey, enabled ? "1" : "0");
    window.dispatchEvent(new CustomEvent(changeEvent, { detail: enabled }));
  }
  return { soundEnabled, setSoundEnabled };
}

export function VideoAudioToggle({ soundEnabled, onChange, compact = false }: { soundEnabled: boolean; onChange: (enabled: boolean) => void; compact?: boolean }) {
  return <Button type="button" size={compact ? "icon" : "sm"} variant={soundEnabled ? "primary" : "secondary"} className={compact ? "h-8 w-8" : "h-8"} onClick={() => onChange(!soundEnabled)} title={soundEnabled ? "Disable audio in playback and exports" : "Enable audio in playback and exports"} aria-label={soundEnabled ? "Disable audio" : "Enable audio"} aria-pressed={soundEnabled}>{soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}{!compact ? (soundEnabled ? "With audio" : "Without audio") : null}</Button>;
}
