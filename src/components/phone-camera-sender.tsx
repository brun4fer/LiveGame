"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CircleStop, Loader2, Radio, RefreshCw, RotateCw, Wifi, WifiOff } from "lucide-react";

import { Button, Panel, Select } from "@/components/ui";
import { closeWebRtcSession, publishCameraStream, type BrowserWebRtcSession } from "@/lib/cloudflare-webrtc";
import type { LiveSessionRecord } from "@/lib/domain";
import { apiFetch } from "@/lib/http";

type CameraRotation = 0 | 90 | 180 | 270;
type WakeLockHandle = { release(): Promise<void>; addEventListener(type: "release", listener: () => void): void };
type PairedSession = LiveSessionRecord & { publishUrl?: string | null; realtimeAvailable?: boolean; realtimeError?: string | null };
type PreparedSegment = { id: string; uploadUrl: string; sequence: number };
type RotatedResources = { stream: MediaStream; video: HTMLVideoElement; stop(): void };

const SEGMENT_MS = 10_000;

function recorderMimeType() {
  const candidates = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function createRotatedStream(source: MediaStream, rotation: CameraRotation): RotatedResources {
  if (rotation === 0) return { stream: source, video: document.createElement("video"), stop() {} };
  const video = document.createElement("video");
  video.srcObject = source;
  video.muted = true;
  video.playsInline = true;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot rotate the camera image.");
  let frame = 0;
  let stopped = false;
  const draw = () => {
    if (stopped) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = rotation === 90 || rotation === 270 ? height : width;
    canvas.height = rotation === 90 || rotation === 270 ? width : height;
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(video, -width / 2, -height / 2, width, height);
    context.restore();
    frame = requestAnimationFrame(draw);
  };
  void video.play().then(draw);
  const stream = canvas.captureStream(25);
  for (const track of source.getAudioTracks()) stream.addTrack(track);
  return {
    stream,
    video,
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      video.pause();
      video.srcObject = null;
      for (const track of stream.getVideoTracks()) track.stop();
    },
  };
}

export function PhoneCameraSender({ token, matchTitle }: { token: string; matchTitle: string }) {
  const previewRef = useRef<HTMLVideoElement>(null);
  const sourceRef = useRef<MediaStream | null>(null);
  const outputRef = useRef<MediaStream | null>(null);
  const rotatedRef = useRef<RotatedResources | null>(null);
  const webRtcRef = useRef<BrowserWebRtcSession | null>(null);
  const sessionRef = useRef<PairedSession | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const segmentGenerationRef = useRef(0);
  const sequenceRef = useRef(0);
  const timelineRef = useRef(0);
  const broadcastingRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [rotation, setRotation] = useState<CameraRotation>(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [connection, setConnection] = useState<"idle" | "connecting" | "live" | "reconnecting">("idle");
  const [pendingUploads, setPendingUploads] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const releaseWakeLock = useCallback(async () => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (lock) await lock.release().catch(() => undefined);
  }, []);

  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      const manager = (navigator as Navigator & { wakeLock: { request(type: "screen"): Promise<WakeLockHandle> } }).wakeLock;
      wakeLockRef.current = await manager.request("screen");
    } catch {
      setWarning("Keep this page open and disable automatic screen lock while filming.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    rotatedRef.current?.stop();
    rotatedRef.current = null;
    for (const track of sourceRef.current?.getTracks() ?? []) track.stop();
    sourceRef.current = null;
    outputRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const connectCamera = useCallback(async (nextDeviceId = deviceId, nextRotation = rotation) => {
    setError(null);
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Open this link over HTTPS in Chrome or Safari to use the camera.");
    let source: MediaStream;
    const video = {
      ...(nextDeviceId ? { deviceId: { exact: nextDeviceId } } : { facingMode: { ideal: "environment" } }),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 25, max: 30 },
    };
    try {
      source = await navigator.mediaDevices.getUserMedia({ video, audio: { echoCancellation: false, noiseSuppression: false } });
    } catch {
      source = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      setWarning("The camera is connected without audio. Check microphone permission if match sound is required.");
    }
    sourceRef.current = source;
    const resources = createRotatedStream(source, nextRotation);
    rotatedRef.current = resources;
    outputRef.current = resources.stream;
    if (previewRef.current) {
      previewRef.current.srcObject = resources.stream;
      await previewRef.current.play().catch(() => undefined);
    }
    const listed = await navigator.mediaDevices.enumerateDevices();
    const cameras = listed.filter((device) => device.kind === "videoinput");
    setDevices(cameras);
    const actualId = source.getVideoTracks()[0]?.getSettings().deviceId;
    if (actualId) setDeviceId(actualId);
    setCameraReady(true);
    for (const track of source.getVideoTracks()) track.addEventListener("ended", () => {
      setWarning("The camera signal was lost. Reconnect the device or choose the camera again.");
      if (broadcastingRef.current) setConnection("reconnecting");
    }, { once: true });
    return resources.stream;
  }, [deviceId, rotation, stopCamera]);

  const uploadSegment = useCallback(async (sessionId: string, sequence: number, startedAtSeconds: number, blob: Blob, durationSeconds: number) => {
    if (!blob.size || durationSeconds <= 0) return;
    setPendingUploads((value) => value + 1);
    let prepared: PreparedSegment | null = null;
    try {
      prepared = await apiFetch<PreparedSegment>(`/api/camera/${encodeURIComponent(token)}/segments`, {
        method: "POST",
        body: JSON.stringify({ liveSessionId: sessionId, sequence, startedAtSeconds, mimeType: blob.type || "video/webm" }),
      });
      const uploaded = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "Content-Type": blob.type || "video/webm" }, body: blob });
      if (!uploaded.ok) throw new Error(`Replay upload failed (${uploaded.status}).`);
      await apiFetch(`/api/camera/${encodeURIComponent(token)}/segments/${prepared.id}`, {
        method: "PATCH",
        body: JSON.stringify({ liveSessionId: sessionId, durationSeconds, fileSize: blob.size }),
      });
      setWarning(null);
    } catch (uploadError) {
      if (prepared) void fetch(`/api/camera/${encodeURIComponent(token)}/segments/${prepared.id}?liveSessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      setWarning(`${uploadError instanceof Error ? uploadError.message : "Replay upload failed."} The live image is still transmitting.`);
    } finally {
      setPendingUploads((value) => Math.max(0, value - 1));
    }
  }, [token]);

  const recordSegment = useCallback((sessionId: string, generation: number) => {
    const stream = outputRef.current;
    if (!broadcastingRef.current || !stream || generation !== segmentGenerationRef.current || typeof MediaRecorder === "undefined") return;
    const mimeType = recorderMimeType();
    const sequence = sequenceRef.current++;
    const startedAtSeconds = timelineRef.current;
    const startedAt = performance.now();
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_500_000 });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      if (segmentTimerRef.current !== null) window.clearTimeout(segmentTimerRef.current);
      const durationSeconds = Math.min(15, Math.max(0.1, (performance.now() - startedAt) / 1000));
      timelineRef.current = startedAtSeconds + durationSeconds;
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
      if (broadcastingRef.current && generation === segmentGenerationRef.current) recordSegment(sessionId, generation);
      void uploadSegment(sessionId, sequence, startedAtSeconds, blob, durationSeconds);
    };
    recorder.start();
    segmentTimerRef.current = window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, SEGMENT_MS);
  }, [uploadSegment]);

  const publish = useCallback(async (stream: MediaStream, session: PairedSession) => {
    if (!session.publishUrl) throw new Error(session.realtimeError || "The live publishing address is unavailable.");
    closeWebRtcSession(webRtcRef.current);
    const webRtc = await publishCameraStream(stream, session.publishUrl);
    webRtcRef.current = webRtc;
    webRtc.peer.onconnectionstatechange = () => {
      const state = webRtc.peer.connectionState;
      if (state === "connected") {
        reconnectAttemptsRef.current = 0;
        setConnection("live");
      } else if ((state === "failed" || state === "disconnected") && broadcastingRef.current) {
        setConnection("reconnecting");
        if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
        const delay = Math.min(12_000, 2_000 * (reconnectAttemptsRef.current + 1));
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          const currentStream = outputRef.current;
          const currentSession = sessionRef.current;
          if (broadcastingRef.current && currentStream && currentSession) void publish(currentStream, currentSession).catch((reason) => setWarning(reason instanceof Error ? reason.message : "Could not reconnect the live image."));
        }, delay);
      }
    };
  }, []);

  async function startBroadcast() {
    setStarting(true);
    setError(null);
    setWarning(null);
    setConnection("connecting");
    try {
      const stream = outputRef.current || await connectCamera();
      const previousSessionId = sessionRef.current?.id;
      const session = await apiFetch<PairedSession>(`/api/camera/${encodeURIComponent(token)}/session`, { method: "POST", body: "{}" });
      sessionRef.current = session;
      if (previousSessionId !== session.id) {
        const lastSegment = session.segments.at(-1);
        sequenceRef.current = (lastSegment?.sequence ?? -1) + 1;
        timelineRef.current = lastSegment ? lastSegment.startedAtSeconds + (lastSegment.durationSeconds || 0) : 0;
      }
      broadcastingRef.current = true;
      setBroadcasting(true);
      await publish(stream, session);
      segmentGenerationRef.current += 1;
      recordSegment(session.id, segmentGenerationRef.current);
      await acquireWakeLock();
    } catch (reason) {
      broadcastingRef.current = false;
      setBroadcasting(false);
      setConnection("idle");
      setError(reason instanceof Error ? reason.message : "The wireless broadcast could not start.");
    } finally {
      setStarting(false);
    }
  }

  async function stopBroadcast() {
    broadcastingRef.current = false;
    segmentGenerationRef.current += 1;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    if (segmentTimerRef.current !== null) window.clearTimeout(segmentTimerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    closeWebRtcSession(webRtcRef.current);
    webRtcRef.current = null;
    setBroadcasting(false);
    setConnection("idle");
    await releaseWakeLock();
  }

  async function changeDevice(nextDeviceId: string) {
    setDeviceId(nextDeviceId);
    const wasBroadcasting = broadcastingRef.current;
    if (wasBroadcasting) await stopBroadcast();
    try {
      await connectCamera(nextDeviceId, rotation);
      if (wasBroadcasting) await startBroadcast();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The selected camera could not be opened.");
    }
  }

  async function rotate() {
    const next = ((rotation + 90) % 360) as CameraRotation;
    setRotation(next);
    const wasBroadcasting = broadcastingRef.current;
    if (wasBroadcasting) await stopBroadcast();
    try {
      await connectCamera(deviceId, next);
      if (wasBroadcasting) await startBroadcast();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The camera image could not be rotated.");
    }
  }

  useEffect(() => {
    const visibility = () => { if (document.visibilityState === "visible" && broadcastingRef.current) void acquireWakeLock(); };
    const online = () => {
      const stream = outputRef.current;
      const session = sessionRef.current;
      if (broadcastingRef.current && stream && session) void publish(stream, session).catch(() => setConnection("reconnecting"));
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", online);
      broadcastingRef.current = false;
      segmentGenerationRef.current += 1;
      if (segmentTimerRef.current !== null) window.clearTimeout(segmentTimerRef.current);
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      closeWebRtcSession(webRtcRef.current);
      stopCamera();
      void releaseWakeLock();
    };
  }, [acquireWakeLock, publish, releaseWakeLock, stopCamera]);

  return <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-3 p-3 sm:p-5">
    <header className="flex items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.22em] text-cyan-300">Live Game wireless camera</p><h1 className="truncate text-lg font-semibold text-white">{matchTitle}</h1></div>
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${connection === "live" ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200" : connection === "reconnecting" ? "border-amber-300/30 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[.05] text-slate-300"}`}>{connection === "live" ? <Wifi size={13} /> : connection === "reconnecting" ? <RefreshCw size={13} className="animate-spin" /> : <WifiOff size={13} />}{connection === "live" ? "Live" : connection === "reconnecting" ? "Reconnecting" : connection === "connecting" ? "Connecting" : "Ready"}</span>
    </header>
    <Panel className="relative flex min-h-0 flex-1 overflow-hidden bg-black">
      <video ref={previewRef} muted autoPlay playsInline className="h-full min-h-[55dvh] w-full object-contain" />
      {!cameraReady ? <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center"><Camera size={48} className="text-cyan-200" /><h2 className="mt-3 font-semibold text-white">Use this phone as the match camera</h2><p className="mt-2 max-w-md text-sm text-slate-400">Turn the phone horizontally, allow camera access, then start the broadcast.</p><Button className="mt-5" variant="primary" onClick={() => void connectCamera().catch((reason) => setError(reason instanceof Error ? reason.message : "The camera could not be opened."))}><Camera size={16} />Connect camera</Button></div> : null}
      {broadcasting ? <span className="absolute left-3 top-3 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white">● LIVE</span> : null}
    </Panel>
    {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><span>{error}</span></div> : null}
    {warning ? <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-50"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><span>{warning}</span></div> : null}
    <Panel className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <Select aria-label="Phone camera" value={deviceId} onChange={(event) => void changeDevice(event.target.value)} disabled={starting} className="sm:flex-1">{devices.length ? devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>) : <option value="">Rear camera</option>}</Select>
      <Button onClick={() => void rotate()} disabled={!cameraReady || starting}><RotateCw size={15} />Rotate {rotation}°</Button>
      {!broadcasting ? <Button variant="primary" onClick={() => void startBroadcast()} disabled={starting}>{starting ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} />}{starting ? "Starting…" : "Start broadcast"}</Button> : <Button variant="danger" onClick={() => void stopBroadcast()}><CircleStop size={15} />Stop for interval</Button>}
    </Panel>
    <p className="px-1 text-center text-xs leading-5 text-slate-500">Keep this page open. Stopping for the interval preserves the recorded parts; press Start broadcast again for the second half. {pendingUploads ? `${pendingUploads} replay segment${pendingUploads === 1 ? "" : "s"} uploading.` : "Replay segments are up to date."}</p>
  </main>;
}
