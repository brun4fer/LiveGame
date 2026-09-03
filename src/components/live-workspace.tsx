"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, ChevronsLeft, ChevronsRight, CircleStop, Clock3, Loader2, Pause, Pencil, Play, Radio, RotateCcw, Settings2, Trash2, Users, Video, X } from "lucide-react";

import { MatchEditDialog } from "@/components/match-edit-dialog";
import { MomentEditDialog } from "@/components/moment-edit-dialog";
import { Badge, Button, Panel, Select } from "@/components/ui";
import type { AccountPayload, LiveSegmentRecord, LiveSessionRecord, MatchDetail, MomentRecord, SettingsPayload } from "@/lib/domain";
import { apiFetch } from "@/lib/http";
import { closeWebRtcSession, publishCameraStream, receiveCameraStream, type BrowserWebRtcSession } from "@/lib/cloudflare-webrtc";
import { getReplayEdge, locateReplayPosition } from "@/lib/live-replay";
import { getMatchPeriodAtTime } from "@/lib/match-periods";
import { formatTime, roundTime } from "@/lib/time";

const SEGMENT_MILLISECONDS = 5_000;

type PreparedSegment = { id: string; uploadUrl: string; sequence: number };
type LiveViewer = { user: { id: string; name: string; username: string }; atLiveEdge: boolean; playbackPositionSeconds: number | null };
type ReplayTarget = { segmentId: string; offsetSeconds: number; autoplay: boolean; command: number };
type PeriodMarkerKey = "firstHalfStartSeconds" | "firstHalfEndSeconds" | "secondHalfStartSeconds" | "secondHalfEndSeconds";
type LocalWritableFile = { write(data: Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> };
type LocalFileHandle = { name: string; createWritable(): Promise<LocalWritableFile> };
type LocalDirectoryHandle = { getFileHandle(name: string, options: { create: true }): Promise<LocalFileHandle> };

const periodMarkers: Array<[PeriodMarkerKey, string]> = [
  ["firstHalfStartSeconds", "Start 1st half"],
  ["firstHalfEndSeconds", "End 1st half"],
  ["secondHalfStartSeconds", "Start 2nd half"],
  ["secondHalfEndSeconds", "End 2nd half"],
];

const periodStyles = [
  { short: "1H Start", color: "#22d3ee" },
  { short: "1H End", color: "#60a5fa" },
  { short: "2H Start", color: "#34d399" },
  { short: "2H End", color: "#a78bfa" },
];

function presenceClientId() {
  const key = "live-game-presence-client";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function supportedMimeType() {
  const options = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return options.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "video/webm";
}

function localRecordingFileName(title: string) {
  const safeTitle = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "live-game";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safeTitle}-${timestamp}.webm`;
}

function mergeLiveSession(current: LiveSessionRecord | null, next: LiveSessionRecord | null) {
  if (!next || !current || next.id !== current.id) return next;
  const merged = new Map(current.segments.map((segment) => [segment.id, segment]));
  for (const segment of next.segments) merged.set(segment.id, segment);
  return { ...next, segments: [...merged.values()].sort((a, b) => a.sequence - b.sequence) };
}

export function LiveWorkspace({ matchId }: { matchId: string }) {
  const router = useRouter();
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteLiveVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const publisherSessionRef = useRef<BrowserWebRtcSession | null>(null);
  const viewerSessionRef = useRef<BrowserWebRtcSession | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingRef = useRef(false);
  const recorderTimerRef = useRef<number | null>(null);
  const archiveRecorderRef = useRef<MediaRecorder | null>(null);
  const archiveWriterRef = useRef<LocalWritableFile | null>(null);
  const archiveWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const archiveFinalizedRef = useRef<Promise<void> | null>(null);
  const archiveFileNameRef = useRef<string | null>(null);
  const localSegmentUrlsRef = useRef(new Map<number, string>());
  const sequenceRef = useRef(0);
  const fetchedSequenceRef = useRef(-1);
  const replayCommandRef = useRef(0);
  const pendingUploadsRef = useRef(new Set<Promise<void>>());
  const presenceStateRef = useRef({ atLiveEdge: true, playheadSeconds: 0 });

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [session, setSession] = useState<LiveSessionRecord | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [cameraConnected, setCameraConnected] = useState(false);
  const [remoteLiveStream, setRemoteLiveStream] = useState<MediaStream | null>(null);
  const [remotePlaybackNeedsAction, setRemotePlaybackNeedsAction] = useState(false);
  const [realtimeConnecting, setRealtimeConnecting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [localArchiveName, setLocalArchiveName] = useState<string | null>(null);
  const [atLiveEdge, setAtLiveEdge] = useState(true);
  const [replayTarget, setReplayTarget] = useState<ReplayTarget | null>(null);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [seekTime, setSeekTime] = useState("");
  const [previewEnd, setPreviewEnd] = useState<number | null>(null);
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const [busyMomentTypeId, setBusyMomentTypeId] = useState<string | null>(null);
  const [editingMoment, setEditingMoment] = useState<MomentRecord | null>(null);
  const [editingMatch, setEditingMatch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [liveViewers, setLiveViewers] = useState<LiveViewer[]>([]);
  const [clock, setClock] = useState(() => Date.now());

  const applySession = useCallback((next: LiveSessionRecord | null) => {
    setSession((current) => mergeLiveSession(current, next));
    if (!next) return;
    sequenceRef.current = Math.max(sequenceRef.current, ...next.segments.map((item) => item.sequence + 1), 0);
    fetchedSequenceRef.current = Math.max(fetchedSequenceRef.current, ...next.segments.filter((item) => item.status === "READY").map((item) => item.sequence), -1);
  }, []);

  const refresh = useCallback(async () => {
    const [nextMatch, nextSettings, nextAccount, nextSession] = await Promise.all([
      apiFetch<MatchDetail>(`/api/matches/${matchId}`),
      apiFetch<SettingsPayload>("/api/settings"),
      apiFetch<AccountPayload>("/api/account"),
      apiFetch<LiveSessionRecord | null>(`/api/matches/${matchId}/live`),
    ]);
    setMatch(nextMatch);
    setSettings(nextSettings);
    setAccount(nextAccount);
    setSelectedMomentId((current) => current || nextMatch.moments[0]?.id || null);
    applySession(nextSession);
  }, [applySession, matchId]);

  useEffect(() => {
    refresh().catch((error: Error) => setNotice(error.message)).finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const cursor = fetchedSequenceRef.current;
      Promise.all([
        apiFetch<LiveSessionRecord | null>(`/api/matches/${matchId}/live?afterSequence=${Math.max(-1, cursor)}`),
        apiFetch<MatchDetail>(`/api/matches/${matchId}`),
      ]).then(([nextSession, nextMatch]) => {
        applySession(nextSession);
        setMatch(nextMatch);
      }).catch(() => undefined);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [applySession, matchId]);

  useEffect(() => () => {
    recordingRef.current = false;
    if (recorderTimerRef.current !== null) window.clearTimeout(recorderTimerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    if (archiveRecorderRef.current?.state === "recording") archiveRecorderRef.current.stop();
    closeWebRtcSession(publisherSessionRef.current);
    closeWebRtcSession(viewerSessionRef.current);
    publisherSessionRef.current = null;
    viewerSessionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    for (const url of localSegmentUrlsRef.current.values()) URL.revokeObjectURL(url);
    localSegmentUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!recording && !stopping) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [recording, stopping]);

  useEffect(() => {
    if (cameraVideoRef.current && streamRef.current) cameraVideoRef.current.srcObject = streamRef.current;
  }, [cameraConnected, atLiveEdge]);

  useEffect(() => {
    const video = remoteLiveVideoRef.current;
    if (!video || !remoteLiveStream) return;
    video.srcObject = remoteLiveStream;
    void video.play().then(() => setRemotePlaybackNeedsAction(false)).catch(() => setRemotePlaybackNeedsAction(true));
  }, [atLiveEdge, remoteLiveStream]);

  const readySegments = useMemo(
    () => session?.segments.filter((segment) => segment.status === "READY" && segment.playbackUrl).sort((a, b) => a.sequence - b.sequence) || [],
    [session?.segments],
  );
  const selectedSegment = readySegments.find((segment) => segment.id === replayTarget?.segmentId) || null;
  const availableEdgeSeconds = getReplayEdge(readySegments);
  const liveEdgeSeconds = session?.status === "LIVE" && session.recordingStartedAt
    ? Math.max(availableEdgeSeconds, (clock - Date.parse(session.recordingStartedAt)) / 1000)
    : availableEdgeSeconds;
  const currentTime = atLiveEdge && (cameraConnected || remoteLiveStream) ? liveEdgeSeconds : playheadSeconds;
  const activeLive = session?.status === "LIVE";
  const canStartCameraRecording = !activeLive || session?.startedBy.id === account?.id;
  const currentPeriod = match ? getMatchPeriodAtTime(match, currentTime) : null;
  const lastMoment = match?.moments.reduce<MomentRecord | null>((latest, moment) => !latest || Date.parse(moment.createdAt) > Date.parse(latest.createdAt) ? moment : latest, null) || null;

  useEffect(() => {
    const playbackUrl = session?.playbackUrl;
    if (!activeLive || !atLiveEdge || cameraConnected || !playbackUrl) {
      closeWebRtcSession(viewerSessionRef.current);
      viewerSessionRef.current = null;
      setRemoteLiveStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return null;
      });
      setRealtimeConnecting(false);
      setRemotePlaybackNeedsAction(false);
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;

    const disconnect = () => {
      closeWebRtcSession(viewerSessionRef.current);
      viewerSessionRef.current = null;
      setRemoteLiveStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return null;
      });
    };
    const retry = () => {
      if (!cancelled && retryTimer === null) retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void connect();
      }, 2_500);
    };
    const connect = async () => {
      disconnect();
      setRealtimeConnecting(true);
      try {
        const received = await receiveCameraStream(playbackUrl);
        if (cancelled) {
          received.stream.getTracks().forEach((track) => track.stop());
          closeWebRtcSession(received);
          return;
        }
        viewerSessionRef.current = received;
        received.peer.onconnectionstatechange = () => {
          if (!["failed", "closed"].includes(received.peer.connectionState) || cancelled || viewerSessionRef.current !== received) return;
          disconnect();
          retry();
        };
        setRemoteLiveStream(received.stream);
        setRealtimeConnecting(false);
      } catch {
        if (!cancelled) {
          setRealtimeConnecting(false);
          retry();
        }
      }
    };

    void connect();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      disconnect();
      setRealtimeConnecting(false);
    };
  }, [activeLive, atLiveEdge, cameraConnected, session?.id, session?.playbackUrl]);

  useEffect(() => {
    const video = replayVideoRef.current;
    if (!video || !selectedSegment || !replayTarget) return;
    const applyTarget = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : selectedSegment.durationSeconds || 0;
      video.currentTime = Math.max(0, Math.min(Math.max(0, duration - 0.02), replayTarget.offsetSeconds));
      video.playbackRate = playbackRate;
      if (replayTarget.autoplay) void video.play();
      else video.pause();
    };
    if (video.readyState >= 1) applyTarget();
    else video.addEventListener("loadedmetadata", applyTarget, { once: true });
    return () => video.removeEventListener("loadedmetadata", applyTarget);
  }, [playbackRate, replayTarget, selectedSegment]);

  useEffect(() => {
    if (!atLiveEdge || cameraConnected || !activeLive || readySegments.length === 0) return;
    const latest = readySegments[readySegments.length - 1];
    setReplayTarget((current) => {
      if (current?.segmentId === latest.id) return current;
      setPlayheadSeconds(latest.startedAtSeconds);
      return { segmentId: latest.id, offsetSeconds: 0, autoplay: true, command: ++replayCommandRef.current };
    });
  }, [activeLive, atLiveEdge, cameraConnected, readySegments]);

  useEffect(() => {
    presenceStateRef.current = { atLiveEdge, playheadSeconds: currentTime };
  }, [atLiveEdge, currentTime]);

  useEffect(() => {
    if (!session?.id) return;
    const liveSessionId = session.id;
    const clientId = presenceClientId();
    let stopped = false;
    async function heartbeat() {
      try {
        const presence = presenceStateRef.current;
        const result = await apiFetch<{ liveViewers: LiveViewer[] }>("/api/presence", {
          method: "POST",
          body: JSON.stringify({ clientId, liveSessionId, playbackPositionSeconds: presence.playheadSeconds, atLiveEdge: presence.atLiveEdge }),
        });
        if (!stopped) setLiveViewers(result.liveViewers);
      } catch {
        // Presence must never interrupt recording or replay.
      }
    }
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 5_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      void apiFetch("/api/presence", { method: "POST", body: JSON.stringify({ clientId, liveSessionId: null, playbackPositionSeconds: null, atLiveEdge: true }) }).catch(() => undefined);
    };
  }, [session?.id]);

  const openSegment = useCallback((segment: LiveSegmentRecord, offsetSeconds = 0, autoplay = true, keepLiveEdge = false) => {
    const duration = segment.durationSeconds || 0;
    const safeOffset = Math.max(0, Math.min(Math.max(0, duration - 0.02), offsetSeconds));
    setAtLiveEdge(keepLiveEdge);
    setPlayheadSeconds(segment.startedAtSeconds + safeOffset);
    setReplayTarget({ segmentId: segment.id, offsetSeconds: safeOffset, autoplay, command: ++replayCommandRef.current });
  }, []);

  const seekVirtual = useCallback((seconds: number, autoplay = true) => {
    const position = locateReplayPosition(readySegments, seconds);
    if (!position) return false;
    openSegment(position.segment, position.offsetSeconds, autoplay, false);
    return true;
  }, [openSegment, readySegments]);

  const goLive = useCallback(() => {
    setPreviewEnd(null);
    setAtLiveEdge(true);
    if (cameraConnected || session?.playbackUrl) {
      setReplayTarget(null);
      setPlayheadSeconds(liveEdgeSeconds);
      setPlaying(true);
      if (!cameraConnected && remoteLiveVideoRef.current) void remoteLiveVideoRef.current.play().catch(() => setRemotePlaybackNeedsAction(true));
      return;
    }
    const latest = readySegments.at(-1);
    if (latest) openSegment(latest, 0, true, true);
  }, [cameraConnected, liveEdgeSeconds, openSegment, readySegments, session?.playbackUrl]);

  const togglePlayback = useCallback(() => {
    setPreviewEnd(null);
    if (atLiveEdge && (cameraConnected || remoteLiveStream)) {
      if (!cameraConnected && remoteLiveVideoRef.current?.paused) {
        void remoteLiveVideoRef.current.play().catch(() => setRemotePlaybackNeedsAction(true));
        return;
      }
      if (availableEdgeSeconds > 0) seekVirtual(availableEdgeSeconds - 0.05, false);
      else if (!cameraConnected) remoteLiveVideoRef.current?.pause();
      return;
    }
    const video = replayVideoRef.current;
    if (video) {
      if (video.paused) void video.play();
      else video.pause();
      return;
    }
    const latest = readySegments.at(-1);
    if (latest) openSegment(latest, 0, true, false);
  }, [atLiveEdge, availableEdgeSeconds, cameraConnected, openSegment, readySegments, remoteLiveStream, seekVirtual]);

  const markMoment = useCallback(async (momentTypeId: string) => {
    if (!session || session.status !== "LIVE") return setNotice("Wait for the live session to start before tagging a moment.");
    const markedAtSeconds = atLiveEdge && session.recordingStartedAt ? (Date.now() - Date.parse(session.recordingStartedAt)) / 1000 : playheadSeconds;
    setBusyMomentTypeId(momentTypeId);
    try {
      const saved = await apiFetch<MomentRecord>(`/api/matches/${matchId}/live/moments`, {
        method: "POST",
        body: JSON.stringify({ liveSessionId: session.id, momentTypeId, markedAtSeconds, leadSeconds: 20 }),
      });
      setMatch((current) => current ? { ...current, moments: [...current.moments, saved].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds), momentCount: current.momentCount + 1 } : current);
      setSelectedMomentId(saved.id);
      setNotice(`${saved.momentType.name} saved: ${formatTime(saved.startTimeSeconds)} – ${formatTime(saved.endTimeSeconds)}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The moment could not be saved.");
    } finally {
      setBusyMomentTypeId(null);
    }
  }, [atLiveEdge, matchId, playheadSeconds, session]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.matches("input, textarea, select")) return;
      if (editingMoment || editingMatch) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setPreviewEnd(null);
        void seekVirtual(currentTime + (event.key === "ArrowLeft" ? -5 : 5), atLiveEdge || playing);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
        return;
      }
      const type = settings?.momentTypes.find((item) => item.active && item.defaultShortcut?.toLowerCase() === event.key.toLowerCase());
      if (!type) return;
      event.preventDefault();
      void markMoment(type.id);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [atLiveEdge, currentTime, editingMatch, editingMoment, markMoment, playing, seekVirtual, settings?.momentTypes, togglePlayback]);

  async function connectCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return setNotice("Camera capture is not supported in this browser.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: true,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;
      setCameraConnected(true);
      setAtLiveEdge(true);
      setReplayTarget(null);
      const available = await navigator.mediaDevices.enumerateDevices();
      setDevices(available.filter((device) => device.kind === "videoinput"));
      const activeDevice = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (activeDevice) setDeviceId(activeDevice);
      setNotice("Camera connected. Start the live session when the match feed is ready.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The camera could not be opened.");
    }
  }

  async function chooseLocalRecordingFolder() {
    const pickerWindow = window as Window & {
      showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite"; startIn?: string }) => Promise<LocalDirectoryHandle>;
    };
    if (!pickerWindow.showDirectoryPicker) {
      setNotice("Folder recording requires desktop Chrome or Edge. Open Live Game there and try again.");
      return null;
    }
    try {
      return await pickerWindow.showDirectoryPicker.call(window, { id: "live-game-recordings", mode: "readwrite", startIn: "videos" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setNotice("Live recording was not started because no local folder was selected.");
      else setNotice(error instanceof Error ? error.message : "The selected folder could not be opened.");
      return null;
    }
  }

  async function startLocalArchive(directory: LocalDirectoryHandle) {
    if (!streamRef.current || !match) throw new Error("Connect the camera before creating the local recording.");
    const fileName = localRecordingFileName(match.title);
    const fileHandle = await directory.getFileHandle(fileName, { create: true });
    const writer = await fileHandle.createWritable();
    const mimeType = supportedMimeType();
    let archiveRecorder: MediaRecorder;
    try {
      archiveRecorder = new MediaRecorder(streamRef.current, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 });
    } catch (error) {
      await writer.abort?.().catch(() => undefined);
      throw error;
    }

    archiveWriterRef.current = writer;
    archiveRecorderRef.current = archiveRecorder;
    archiveWriteChainRef.current = Promise.resolve();
    archiveFileNameRef.current = fileName;
    setLocalArchiveName(fileName);
    let resolveFinalization!: () => void;
    let rejectFinalization!: (reason?: unknown) => void;
    archiveFinalizedRef.current = new Promise<void>((resolve, reject) => {
      resolveFinalization = resolve;
      rejectFinalization = reject;
    });
    archiveRecorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      archiveWriteChainRef.current = archiveWriteChainRef.current.then(() => writer.write(event.data));
      void archiveWriteChainRef.current.catch(() => undefined);
    };
    archiveRecorder.onstop = async () => {
      try {
        await archiveWriteChainRef.current;
        await writer.close();
        resolveFinalization();
      } catch (error) {
        await writer.abort?.().catch(() => undefined);
        rejectFinalization(error);
      } finally {
        archiveRecorderRef.current = null;
        archiveWriterRef.current = null;
      }
    };
    archiveRecorder.start(1_000);
  }

  async function stopLocalArchive() {
    const archiveRecorder = archiveRecorderRef.current;
    const finalization = archiveFinalizedRef.current;
    if (archiveRecorder?.state === "recording") archiveRecorder.stop();
    if (finalization) await finalization;
    archiveFinalizedRef.current = null;
  }

  async function startRealtimePublisher(activeSession: LiveSessionRecord) {
    closeWebRtcSession(publisherSessionRef.current);
    publisherSessionRef.current = null;
    if (!activeSession.publishUrl) return activeSession.realtimeError || "Realtime camera sharing is not configured. Staff will use the delayed cloud replay.";
    if (!streamRef.current) return "The camera stream is not available for realtime sharing.";
    try {
      const published = await publishCameraStream(streamRef.current, activeSession.publishUrl);
      publisherSessionRef.current = published;
      published.peer.onconnectionstatechange = () => {
        if (!["failed", "disconnected"].includes(published.peer.connectionState) || publisherSessionRef.current !== published) return;
        setNotice("Realtime camera sharing was interrupted. Local recording and cloud replay are still running.");
      };
      return null;
    } catch (error) {
      return `${error instanceof Error ? error.message : "Realtime camera sharing could not start."} Local recording and cloud replay are still available.`;
    }
  }

  async function startLive() {
    const directory = await chooseLocalRecordingFolder();
    if (!directory) return;
    if (!streamRef.current) {
      await connectCamera();
      if (!streamRef.current) return;
    }
    try {
      const next = await apiFetch<LiveSessionRecord>(`/api/matches/${matchId}/live`, { method: "POST", body: JSON.stringify({ sourceType: "BROWSER_CAMERA" }) });
      for (const url of localSegmentUrlsRef.current.values()) URL.revokeObjectURL(url);
      localSegmentUrlsRef.current.clear();
      setSession(next);
      sequenceRef.current = Math.max(...next.segments.map((segment) => segment.sequence + 1), 0);
      fetchedSequenceRef.current = Math.max(...next.segments.map((segment) => segment.sequence), -1);
      recordingRef.current = true;
      setRecording(true);
      setAtLiveEdge(true);
      setReplayTarget(null);
      try {
        await startLocalArchive(directory);
      } catch (archiveError) {
        recordingRef.current = false;
        setRecording(false);
        await apiFetch(`/api/matches/${matchId}/live`, { method: "PATCH" }).catch(() => undefined);
        setSession(null);
        setNotice(archiveError instanceof Error ? archiveError.message : "The local recording file could not be created.");
        return;
      }
      void recordNextSegment(next);
      const realtimeWarning = await startRealtimePublisher(next);
      setNotice(realtimeWarning
        ? `Live recording started. A local copy is being saved as ${archiveFileNameRef.current}. ${realtimeWarning}`
        : `Live recording started and is now shared with the staff. A local copy is being saved as ${archiveFileNameRef.current}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The live session could not be started.");
    }
  }

  async function recordNextSegment(activeSession: LiveSessionRecord) {
    if (!recordingRef.current || !streamRef.current) return;
    const sequence = sequenceRef.current++;
    const recordingStart = activeSession.recordingStartedAt ? Date.parse(activeSession.recordingStartedAt) : Date.now();
    const startedAtSeconds = Math.max(0, (Date.now() - recordingStart) / 1000);
    const mimeType = supportedMimeType();
    const preparation = apiFetch<PreparedSegment>(`/api/live-sessions/${activeSession.id}/segments`, {
      method: "POST",
      body: JSON.stringify({ sequence, startedAtSeconds, mimeType }),
    }).then((prepared) => ({ prepared, error: null })).catch((error: unknown) => ({ prepared: null, error }));
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 });
    recorderRef.current = recorder;
    const startedAt = performance.now();
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const durationSeconds = Math.max(0.1, (performance.now() - startedAt) / 1000);
      const blob = new Blob(chunks, { type: mimeType });
      // Begin the next independent recording immediately. Preparing and uploading
      // this completed segment must never introduce a gap in the camera capture.
      if (recordingRef.current) void recordNextSegment(activeSession);
      const upload = preparation.then(async ({ prepared, error }) => {
        if (!blob.size) throw new Error(`Recording segment ${sequence + 1} contains no video data.`);
        const localId = prepared?.id || `local-${activeSession.id}-${sequence}`;
        const localPlaybackUrl = URL.createObjectURL(blob);
        const previousUrl = localSegmentUrlsRef.current.get(sequence);
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        localSegmentUrlsRef.current.set(sequence, localPlaybackUrl);
        const localSegment: LiveSegmentRecord = {
          id: localId,
          sequence,
          startedAtSeconds,
          durationSeconds,
          mimeType,
          fileSize: String(blob.size),
          status: "READY",
          readyAt: new Date().toISOString(),
          playbackUrl: localPlaybackUrl,
          playbackUrlExpiresAt: null,
        };
        setSession((current) => current && current.id === activeSession.id
          ? { ...current, segments: [...current.segments.filter((segment) => segment.sequence !== sequence), localSegment].sort((a, b) => a.sequence - b.sequence) }
          : current);
        if (!prepared) throw error instanceof Error ? error : new Error(`Cloud replay segment ${sequence + 1} could not be prepared.`);
        try {
          const saved = await uploadSegment(activeSession.id, prepared, blob, durationSeconds);
          setSession((current) => current && current.id === activeSession.id
            ? { ...current, segments: [...current.segments.filter((segment) => segment.sequence !== sequence), saved].sort((a, b) => a.sequence - b.sequence) }
            : current);
          window.setTimeout(() => {
            if (localSegmentUrlsRef.current.get(sequence) !== localPlaybackUrl) return;
            URL.revokeObjectURL(localPlaybackUrl);
            localSegmentUrlsRef.current.delete(sequence);
          }, 1_000);
        } catch (uploadError) {
          await apiFetch(`/api/live-sessions/${activeSession.id}/segments/${prepared.id}`, { method: "DELETE" }).catch(() => undefined);
          throw uploadError;
        }
      }).catch((error) => {
        setNotice(`${error instanceof Error ? error.message : `Cloud replay segment ${sequence + 1} failed.`} Local replay and recording are still running.`);
      });
      pendingUploadsRef.current.add(upload);
      void upload.finally(() => pendingUploadsRef.current.delete(upload));
    };
    recorder.start();
    recorderTimerRef.current = window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, SEGMENT_MILLISECONDS);
  }

  async function uploadSegment(liveSessionId: string, prepared: PreparedSegment, blob: Blob, durationSeconds: number) {
    if (!blob.size) throw new Error(`Recording segment ${prepared.sequence + 1} contains no video data.`);
    const response = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
    if (!response.ok) throw new Error(`Recording segment ${prepared.sequence + 1} could not be stored.`);
    const saved = await apiFetch<LiveSegmentRecord>(`/api/live-sessions/${liveSessionId}/segments/${prepared.id}`, { method: "PATCH", body: JSON.stringify({ durationSeconds, fileSize: blob.size }) });
    fetchedSequenceRef.current = Math.max(fetchedSequenceRef.current, saved.sequence);
    return saved;
  }

  async function stopLive() {
    setStopping(true);
    recordingRef.current = false;
    setRecording(false);
    if (recorderTimerRef.current !== null) window.clearTimeout(recorderTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") await new Promise<void>((resolve) => { recorder.addEventListener("stop", () => resolve(), { once: true }); recorder.stop(); });
    closeWebRtcSession(publisherSessionRef.current);
    publisherSessionRef.current = null;
    const finalizationResults = await Promise.allSettled([stopLocalArchive(), ...pendingUploadsRef.current]);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraConnected(false);
    try {
      const ended = await apiFetch<LiveSessionRecord>(`/api/matches/${matchId}/live`, { method: "PATCH" });
      setSession(ended);
      setAtLiveEdge(false);
      const latest = ended.segments.filter((segment) => segment.status === "READY" && segment.playbackUrl).at(-1);
      if (latest) openSegment(latest, 0, false, false);
      const localFailed = finalizationResults[0]?.status === "rejected";
      setNotice(localFailed
        ? "The live session ended, but the local video file could not be finalized. The cloud DVR segments remain available."
        : `The live session ended. ${archiveFileNameRef.current || "The local video"} is saved and can be uploaded to R2.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The live session could not be stopped cleanly.");
    } finally {
      setStopping(false);
    }
  }

  function advanceReplay() {
    if (!selectedSegment) return;
    const next = readySegments[readySegments.findIndex((segment) => segment.id === selectedSegment.id) + 1];
    if (next) return openSegment(next, 0, true, atLiveEdge);
    setPlaying(false);
  }

  function handleReplayTimeUpdate(video: HTMLVideoElement) {
    if (!selectedSegment) return;
    const virtualTime = selectedSegment.startedAtSeconds + video.currentTime;
    setPlayheadSeconds(virtualTime);
    if (previewEnd !== null && virtualTime >= previewEnd - 0.04) {
      video.pause();
      setPlayheadSeconds(previewEnd);
      setPreviewEnd(null);
    }
  }

  function seekBy(seconds: number) {
    setPreviewEnd(null);
    void seekVirtual(currentTime + seconds, atLiveEdge || playing);
  }

  function goToExactTime() {
    const seconds = Number(seekTime);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > availableEdgeSeconds) return setNotice(`Enter a second between 0 and ${formatTime(availableEdgeSeconds)}.`);
    setPreviewEnd(null);
    void seekVirtual(seconds, true);
  }

  function setRate(rate: number) {
    setPlaybackRate(rate);
    if (replayVideoRef.current) replayVideoRef.current.playbackRate = rate;
  }

  function reviewMoment(moment: MomentRecord) {
    setSelectedMomentId(moment.id);
    setPreviewEnd(moment.endTimeSeconds);
    if (!seekVirtual(moment.startTimeSeconds, true)) setNotice("This part of the recording is not available yet.");
  }

  async function updateMoment(input: Record<string, unknown>) {
    if (!editingMoment) return;
    try {
      const saved = await apiFetch<MomentRecord>(`/api/moments/${editingMoment.id}`, { method: "PATCH", body: JSON.stringify(input) });
      setMatch((current) => current ? { ...current, moments: current.moments.map((moment) => moment.id === saved.id ? saved : moment).sort((a, b) => a.startTimeSeconds - b.startTimeSeconds) } : current);
      setEditingMoment(null);
      setSelectedMomentId(saved.id);
      setNotice("Moment updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update the moment.");
    }
  }

  async function toggleOutcome(moment: MomentRecord, outcome: "positive" | "negative") {
    try {
      const saved = await apiFetch<MomentRecord>(`/api/moments/${moment.id}`, { method: "PATCH", body: JSON.stringify({ outcome: moment.outcome === outcome ? null : outcome }) });
      setMatch((current) => current ? { ...current, moments: current.moments.map((item) => item.id === saved.id ? saved : item) } : current);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not classify the moment.");
    }
  }

  async function removeMoment(moment: MomentRecord, confirmRemoval = true) {
    if (confirmRemoval && !confirm(`Delete ${moment.momentType.name} and all of its submoments?`)) return;
    try {
      await apiFetch(`/api/moments/${moment.id}`, { method: "DELETE" });
      setMatch((current) => {
        if (!current) return current;
        const moments = current.moments.filter((item) => item.id !== moment.id);
        setSelectedMomentId((selected) => selected === moment.id ? moments[0]?.id || null : selected);
        return { ...current, moments, momentCount: Math.max(0, current.momentCount - 1) };
      });
      setNotice(`${moment.momentType.name} deleted.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete the moment.");
    }
  }

  async function setPeriodMarker(key: PeriodMarkerKey) {
    try {
      const saved = await apiFetch<MatchDetail>(`/api/matches/${matchId}`, { method: "PATCH", body: JSON.stringify({ [key]: roundTime(currentTime) }) });
      setMatch(saved);
      setNotice(`Match period saved at ${formatTime(currentTime)}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the match period.");
    }
  }

  async function saveMatch(input: Record<string, unknown>) {
    const saved = await apiFetch<MatchDetail>(`/api/matches/${matchId}`, { method: "PATCH", body: JSON.stringify(input) });
    setMatch(saved);
    setEditingMatch(false);
    setNotice("Match updated.");
  }

  async function removeCurrentMatch() {
    await apiFetch(`/api/matches/${matchId}`, { method: "DELETE" });
    router.replace("/");
    router.refresh();
  }

  if (loading) return <div className="flex min-h-[65vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Preparing Live Game…</div>;
  if (!match || !settings) return <Panel className="border-red-400/20 p-5 text-red-100">{notice || "This match could not be opened."}</Panel>;

  const timelineDuration = Math.max(1, liveEdgeSeconds, ...match.moments.map((moment) => moment.endTimeSeconds));
  const canReplay = readySegments.length > 0;
  const behindLive = activeLive ? Math.max(0, liveEdgeSeconds - currentTime) : 0;
  const showingRemoteLive = Boolean(activeLive && atLiveEdge && !cameraConnected && remoteLiveStream);

  return <div className="flex min-h-0 flex-col gap-2 xl:h-[calc(100dvh-6.5rem)] xl:overflow-hidden">
    <Panel className="flex shrink-0 items-stretch overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 border-r border-white/10 px-2">
        <Link href="/" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-slate-400 hover:bg-white/[.06] hover:text-white"><ArrowLeft size={12} />Matches</Link>
        <Badge className="max-w-44 truncate border-cyan-300/25 bg-cyan-300/10 text-[10px] text-cyan-100" title={match.title}>Live: {match.title}</Badge>
        <button type="button" title="Edit match" aria-label="Edit match" onClick={() => setEditingMatch(true)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-white/[.06] hover:text-white"><Settings2 size={13} /></button>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-2 py-1.5" aria-label="Tag the previous 20 seconds">
        {settings.momentTypes.filter((type) => type.active).map((type) => { const busy = busyMomentTypeId === type.id; return <button key={type.id} type="button" disabled={!activeLive || busyMomentTypeId !== null} onClick={() => void markMoment(type.id)} title={`${type.name}: save the previous 20 seconds${type.defaultShortcut ? ` · ${type.defaultShortcut.toUpperCase()}` : ""}`} className={`flex h-11 min-w-[6rem] shrink-0 items-center justify-between gap-2 rounded-md border px-2 text-left transition ${busy ? "border-cyan-200/70 bg-cyan-300/10 text-white shadow-[0_0_16px_rgba(34,211,238,.18)]" : "border-white/10 bg-white/[.035] hover:bg-white/[.08]"} disabled:opacity-40`}><span className="min-w-0"><span className="block truncate text-[9px] font-bold" style={{ color: type.color }}>{type.name}</span><span className="mt-0.5 block text-[8px] text-slate-600">{busy ? "Saving…" : "Previous 20s"}</span></span><kbd className="rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[9px] text-slate-300">{type.defaultShortcut || "—"}</kbd></button>; })}
      </div>
      <div className="flex shrink-0 items-center gap-1 border-l border-white/10 px-1.5">
        <Select aria-label="Camera" title="Camera" className="hidden h-8 w-36 py-0 text-[10px] 2xl:block" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={recording}>{devices.length === 0 ? <option value="">Default camera</option> : devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</Select>
        {(recording || stopping) && localArchiveName ? <Badge className="hidden max-w-28 truncate border-emerald-300/25 bg-emerald-300/10 text-[9px] text-emerald-100 2xl:inline-flex" title={`${stopping ? "Finalizing" : "Saving"} locally: ${localArchiveName}`}>{stopping ? "Finalizing file" : "Local copy"}</Badge> : null}
        <Button size="icon" className="h-8 w-8" title={cameraConnected ? "Reconnect camera" : "Connect camera"} onClick={() => void connectCamera()} disabled={recording}><Camera size={13} /></Button>
        {!recording && !stopping ? <Button size="sm" variant="primary" className="h-8 whitespace-nowrap px-2 text-[10px]" onClick={() => void startLive()} disabled={!canStartCameraRecording}><Radio size={12} />{activeLive ? canStartCameraRecording ? "Resume recording" : "Live running" : "Start live"}</Button> : <Button size="sm" variant="danger" className="h-8 whitespace-nowrap px-2 text-[10px]" onClick={() => void stopLive()} disabled={stopping}><CircleStop size={12} />{stopping ? "Finalizing…" : "End live"}</Button>}
      </div>
    </Panel>

    {notice ? <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-cyan-300/25 bg-pitch-950/95 px-4 py-3 text-sm text-cyan-50 shadow-2xl backdrop-blur-xl"><span className="min-w-0 flex-1">{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)} className="shrink-0 text-cyan-200/70 transition hover:text-white"><X size={15} /></button></div> : null}

    <div className="grid min-h-0 flex-1 items-stretch gap-2 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <Panel className="order-2 flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="relative aspect-video min-h-72 shrink-0 bg-black xl:aspect-auto xl:min-h-0 xl:flex-1">
          {atLiveEdge && cameraConnected ? <video ref={cameraVideoRef} muted autoPlay playsInline className="h-full w-full object-contain" /> : showingRemoteLive ? <video ref={remoteLiveVideoRef} autoPlay playsInline className="h-full w-full object-contain" onPlay={() => { setPlaying(true); setRemotePlaybackNeedsAction(false); }} onPause={() => setPlaying(false)} /> : selectedSegment?.playbackUrl ? <video key={selectedSegment.id} ref={replayVideoRef} src={selectedSegment.playbackUrl} crossOrigin="anonymous" playsInline className="h-full w-full object-contain" onTimeUpdate={(event) => handleReplayTimeUpdate(event.currentTarget)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={advanceReplay} /> : <div className="flex h-full min-h-72 flex-col items-center justify-center p-6 text-center"><Video size={48} className="text-cyan-200" /><h2 className="mt-3 font-semibold text-white">{activeLive ? realtimeConnecting ? "Connecting to the live camera" : "Waiting for the first live image" : "Connect the match camera"}</h2><p className="mt-2 max-w-lg text-sm text-slate-500">Recording continues while every staff member controls an independent replay.</p></div>}
          {showingRemoteLive && remotePlaybackNeedsAction ? <button type="button" onClick={() => void remoteLiveVideoRef.current?.play()} className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white"><span className="rounded-lg border border-cyan-300/35 bg-pitch-950/90 px-4 py-3"><Play size={16} className="mr-2 inline" />Start live video</span></button> : null}
          {activeLive ? <span className="absolute left-3 top-3 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold text-white">● RECORDING</span> : null}
          {activeLive ? <span className={`absolute right-3 top-3 rounded-md px-2 py-1 text-[10px] font-bold ${atLiveEdge ? "bg-cyan-300 text-slate-950" : "bg-slate-900/85 text-cyan-100"}`}>{atLiveEdge ? "LIVE" : `REPLAY · ${formatTime(behindLive)} behind`}</span> : null}
        </div>
        <div className="shrink-0 border-t border-white/10 bg-pitch-950/90 p-2">
          <input aria-label="Live recording position" type="range" min={0} max={Math.max(availableEdgeSeconds, 0.1)} step={0.1} value={Math.min(currentTime, availableEdgeSeconds)} disabled={!canReplay} onChange={(event) => { setPreviewEnd(null); void seekVirtual(Number(event.target.value), atLiveEdge || playing); }} className="h-1.5 w-full cursor-pointer accent-cyan-300 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: availableEdgeSeconds ? `linear-gradient(to right, #67e8f9 ${(Math.min(currentTime, availableEdgeSeconds) / availableEdgeSeconds) * 100}%, rgba(255,255,255,.14) ${(Math.min(currentTime, availableEdgeSeconds) / availableEdgeSeconds) * 100}%)` : undefined }} />
          <div className="mt-1.5 flex items-center gap-2">
            <div className="min-w-0 flex-1 overflow-x-auto"><div className="flex min-w-max items-center gap-1">
              <Button size="icon" className="h-8 w-8" disabled={!canReplay} title="Back 15 seconds" onClick={() => seekBy(-15)}><ChevronsLeft size={15} /></Button>
              <Button size="icon" className="h-8 w-8" disabled={!canReplay} title="Back 5 seconds (left arrow)" onClick={() => seekBy(-5)}><RotateCcw size={15} /></Button>
              <Button size="icon" className="h-8 w-8" variant="primary" disabled={!canReplay && !showingRemoteLive} title="Play or pause (space)" onClick={togglePlayback}>{playing && !(atLiveEdge && cameraConnected) ? <Pause size={15} /> : <Play size={15} />}</Button>
              <Button size="icon" className="h-8 w-8" disabled={!canReplay} title="Forward 5 seconds (right arrow)" onClick={() => seekBy(5)}><ChevronsRight size={15} /></Button>
              <Button size="icon" className="h-8 w-8" disabled={!canReplay} title="Forward 15 seconds" onClick={() => seekBy(15)}><ChevronsRight size={15} className="scale-125" /></Button>
              <div className="flex overflow-hidden rounded-md border border-white/10">{[1, 2, 4].map((rate) => <button key={rate} type="button" onClick={() => setRate(rate)} className={`h-8 px-2 text-[10px] font-semibold transition ${playbackRate === rate ? "bg-cyan-300 text-slate-950" : "bg-white/[.04] text-slate-300 hover:bg-white/[.1]"}`}>{rate}×</button>)}</div>
              <Button size="sm" variant="primary" className="h-8 whitespace-nowrap px-2 text-[10px]" disabled={!activeLive} onClick={goLive}><Radio size={12} />Go Live</Button>
              <Button size="icon" variant="danger" className="h-8 w-8" disabled={!lastMoment} title={lastMoment ? `Delete last recorded moment: ${lastMoment.momentType.name}` : "No recorded moment to delete"} onClick={() => lastMoment && void removeMoment(lastMoment, false)}><Trash2 size={14} /></Button>
              <div className="ml-1 flex items-center gap-1 border-l border-white/10 pl-2" aria-label="Match period markers">{periodMarkers.map(([key, label], index) => { const seconds = match[key]; const style = periodStyles[index]; const period = index < 2 ? "first_half" : "second_half"; return <div key={key} className="flex overflow-hidden rounded-md border" style={{ borderColor: `${style.color}${currentPeriod === period ? "cc" : "55"}` }}><button type="button" disabled={!cameraConnected && !canReplay} title={seconds === null ? `${label}: save the current video time` : `${label}: go to ${formatTime(seconds)}`} onClick={() => seconds === null ? void setPeriodMarker(key) : void seekVirtual(seconds, true)} className="flex h-8 min-w-[3.6rem] flex-col items-center justify-center px-1.5 leading-none disabled:opacity-40" style={{ backgroundColor: `${style.color}${currentPeriod === period ? "20" : "0c"}` }}><span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: style.color }}>{style.short}</span><span className="mt-0.5 font-mono text-[8px] text-slate-300">{seconds === null ? "Set" : formatTime(seconds)}</span></button>{seconds !== null ? <button type="button" title={`Replace ${label} with the current time`} onClick={() => void setPeriodMarker(key)} className="flex h-8 w-5 items-center justify-center border-l text-slate-500 hover:text-white" style={{ borderColor: `${style.color}45` }}><Clock3 size={9} /></button> : null}</div>; })}</div>
              <form className="ml-1 flex items-center gap-1 border-l border-white/10 pl-2" onSubmit={(event) => { event.preventDefault(); goToExactTime(); }}><input aria-label="Exact second" className="h-8 w-20 rounded-md border border-white/10 bg-black/20 px-2 font-mono text-[10px] text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" type="number" min="0" max={availableEdgeSeconds || undefined} step="0.1" placeholder="Second" value={seekTime} onChange={(event) => setSeekTime(event.target.value)} disabled={!canReplay} /><Button type="submit" size="sm" className="h-8 px-2 text-[10px]" disabled={!canReplay || seekTime === ""}>Go</Button></form>
            </div></div>
            <div className="flex shrink-0 items-center gap-2"><span className="hidden items-center gap-1 font-mono text-xs text-white sm:inline-flex"><Clock3 size={13} className="text-cyan-200" />{formatTime(currentTime)} / {formatTime(liveEdgeSeconds)}</span>{match.moments.length > 0 ? <Link href={`/analysis/${matchId}/submoments`} className="inline-flex h-8 items-center gap-1 rounded-md bg-cyan-300 px-2 text-[10px] font-medium text-slate-950 transition hover:bg-cyan-200">Identify submoments <ChevronsRight size={13} /></Link> : <Button size="sm" variant="primary" className="h-8 px-2 text-[10px]" disabled>Identify submoments <ChevronsRight size={13} /></Button>}</div>
          </div>
        </div>
      </Panel>

      <Panel className="order-1 flex min-h-48 flex-col overflow-hidden xl:min-h-0">
        <div className="shrink-0 border-b border-white/10 px-3 py-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tagged moments</p><p className="mt-1 text-xs text-slate-400">{match.moments.length} in the recording</p></div><Badge title={liveViewers.map((viewer) => `${viewer.user.name} · ${viewer.atLiveEdge ? "live" : "replay"}`).join("\n")}><Users size={11} className="mr-1" />{liveViewers.length || (account ? 1 : 0)}</Badge></div><p className="mt-2 text-[10px] leading-4 text-slate-500">Select a row to review it without stopping the recording.</p></div>
        <div className="min-h-0 flex-1 overflow-y-auto">{match.moments.length === 0 ? <p className="p-3 text-xs leading-5 text-slate-500">Tagged moments will appear here.</p> : match.moments.map((moment) => <div key={moment.id} className={`flex min-h-9 w-full items-center gap-1.5 border-b border-white/[.06] px-2.5 py-1 text-left transition hover:bg-white/[.06] ${selectedMomentId === moment.id ? "bg-cyan-300/10 text-cyan-100" : ""}`}><button type="button" className="flex min-w-0 flex-1 items-center gap-2" onClick={() => reviewMoment(moment)} title={`${moment.momentType.name} · ${formatTime(moment.startTimeSeconds)}${moment.createdBy ? ` · ${moment.createdBy.name}` : ""}`}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: moment.momentType.color }} /><span className="min-w-0 flex-1 truncate text-xs text-slate-200">{moment.momentType.name}</span><span className="shrink-0 font-mono text-[10px] text-slate-500">{formatTime(moment.startTimeSeconds)}</span></button><button aria-label="Mark as positive" onClick={() => void toggleOutcome(moment, "positive")} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${moment.outcome === "positive" ? "border-emerald-300 bg-emerald-400 text-emerald-950" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"}`}><Check size={11} /></button><button aria-label="Mark as negative" onClick={() => void toggleOutcome(moment, "negative")} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${moment.outcome === "negative" ? "border-red-300 bg-red-400 text-red-950" : "border-red-400/25 bg-red-400/10 text-red-300"}`}><X size={11} /></button><button type="button" className="inline-flex h-6 items-center gap-1 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-1.5 text-[10px] text-cyan-100" onClick={() => setEditingMoment(moment)}><Pencil size={11} />Edit</button><button type="button" className="inline-flex h-6 items-center gap-1 rounded-md border border-red-400/30 bg-red-500/10 px-1.5 text-[10px] text-red-100" onClick={() => void removeMoment(moment)}><Trash2 size={11} />Delete</button></div>)}</div>
      </Panel>
    </div>

    <Timeline momentTypes={settings.momentTypes} moments={match.moments} duration={timelineDuration} selectedMomentId={selectedMomentId} onSelect={reviewMoment} />
    {editingMoment ? <MomentEditDialog moment={editingMoment} momentTypes={settings.momentTypes} currentTime={currentTime} duration={timelineDuration} onSave={updateMoment} onClose={() => setEditingMoment(null)} /> : null}
    {editingMatch ? <MatchEditDialog match={match} onSave={saveMatch} onDelete={removeCurrentMatch} onClose={() => setEditingMatch(false)} /> : null}
  </div>;
}

function Timeline({ momentTypes, moments, duration, selectedMomentId, onSelect }: { momentTypes: SettingsPayload["momentTypes"]; moments: MomentRecord[]; duration: number; selectedMomentId: string | null; onSelect: (moment: MomentRecord) => void }) {
  const visibleTypes = useMemo(() => momentTypes.filter((type) => type.active || moments.some((moment) => moment.momentTypeId === type.id)), [momentTypes, moments]);
  return <Panel className="flex shrink-0 flex-col overflow-hidden xl:h-24"><div className="flex shrink-0 items-center justify-between border-b border-white/10 px-2 py-1"><span className="text-[9px] font-semibold uppercase tracking-[.18em] text-slate-500">Timeline</span><span className="text-[9px] text-slate-500">Moments in the recording</span></div><div className="min-h-0 flex-1 overflow-auto bg-black/20"><div className="min-w-[720px] overflow-hidden">{visibleTypes.map((type) => <div key={type.id} className="grid min-h-6 grid-cols-[8rem_minmax(0,1fr)] border-b border-white/[.07] last:border-b-0"><div className="flex items-center gap-2 border-r border-white/[.07] px-2 py-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: type.color }} /><span className="truncate text-[9px] text-slate-300">{type.name}</span></div><div className="relative min-h-6"><div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />{moments.filter((moment) => moment.momentTypeId === type.id).map((moment) => { const left = Math.max(0, Math.min(100, (moment.startTimeSeconds / duration) * 100)); const width = Math.max(0.6, Math.min(100 - left, ((moment.endTimeSeconds - moment.startTimeSeconds) / duration) * 100)); return <button key={moment.id} type="button" title={`${type.name}: ${formatTime(moment.startTimeSeconds)} – ${formatTime(moment.endTimeSeconds)}`} onClick={() => onSelect(moment)} className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full border border-white/20 transition hover:h-4 ${selectedMomentId === moment.id ? "h-4 ring-1 ring-white/50" : ""}`} style={{ left: `${left}%`, width: `${width}%`, backgroundColor: type.color }} />; })}</div></div>)}</div></div></Panel>;
}
