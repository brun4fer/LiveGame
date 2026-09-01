"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, CircleStop, Clock3, Loader2, Pencil, Radio, RotateCcw, Users, Video, X } from "lucide-react";

import { Badge, Button, Panel, Select } from "@/components/ui";
import { MomentEditDialog } from "@/components/moment-edit-dialog";
import type { AccountPayload, LiveSegmentRecord, LiveSessionRecord, MatchDetail, MomentRecord, PlaylistRecord, SettingsPayload } from "@/lib/domain";
import { apiFetch } from "@/lib/http";
import { formatTime } from "@/lib/time";

const SEGMENT_MILLISECONDS = 5_000;

type PreparedSegment = { id: string; uploadUrl: string; sequence: number };
type LiveViewer = { user: { id: string; name: string; username: string }; atLiveEdge: boolean; playbackPositionSeconds: number | null };

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

export function LiveWorkspace({ matchId }: { matchId: string }) {
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingRef = useRef(false);
  const recorderTimerRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const fetchedSequenceRef = useRef(-1);
  const pendingUploadsRef = useRef(new Set<Promise<void>>());
  const presenceStateRef = useRef({ atLiveEdge: true, playheadSeconds: 0 });
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [session, setSession] = useState<LiveSessionRecord | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [cameraConnected, setCameraConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [atLiveEdge, setAtLiveEdge] = useState(true);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [busyMomentTypeId, setBusyMomentTypeId] = useState<string | null>(null);
  const [editingMoment, setEditingMoment] = useState<MomentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [liveViewers, setLiveViewers] = useState<LiveViewer[]>([]);

  const refresh = useCallback(async () => {
    const [nextMatch, nextSettings, nextAccount, nextSession, nextPlaylists] = await Promise.all([
      apiFetch<MatchDetail>(`/api/matches/${matchId}`),
      apiFetch<SettingsPayload>("/api/settings"),
      apiFetch<AccountPayload>("/api/account"),
      apiFetch<LiveSessionRecord | null>(`/api/matches/${matchId}/live`),
      apiFetch<PlaylistRecord[]>("/api/playlists"),
    ]);
    setMatch(nextMatch);
    setSettings(nextSettings);
    setAccount(nextAccount);
    setSession(nextSession);
    setPlaylists(nextPlaylists);
    if (nextSession) {
      sequenceRef.current = Math.max(sequenceRef.current, ...nextSession.segments.map((item) => item.sequence + 1), 0);
      fetchedSequenceRef.current = Math.max(fetchedSequenceRef.current, ...nextSession.segments.filter((item) => item.status === "READY").map((item) => item.sequence), -1);
    }
  }, [matchId]);

  useEffect(() => {
    refresh().catch((error: Error) => setNotice(error.message)).finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const cursor = fetchedSequenceRef.current;
      apiFetch<LiveSessionRecord | null>(`/api/matches/${matchId}/live?afterSequence=${Math.max(-1, cursor)}`).then((next) => {
        setSession((current) => {
          if (!next || !current || next.id !== current.id) return next;
          const merged = new Map(current.segments.map((segment) => [segment.id, segment]));
          for (const segment of next.segments) merged.set(segment.id, segment);
          return { ...next, segments: [...merged.values()].sort((a, b) => a.sequence - b.sequence) };
        });
        if (next) {
          sequenceRef.current = Math.max(sequenceRef.current, ...next.segments.map((item) => item.sequence + 1), 0);
          fetchedSequenceRef.current = Math.max(fetchedSequenceRef.current, ...next.segments.map((item) => item.sequence), -1);
        }
      }).catch(() => undefined);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [matchId]);

  useEffect(() => () => {
    recordingRef.current = false;
    if (recorderTimerRef.current !== null) window.clearTimeout(recorderTimerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (cameraVideoRef.current && streamRef.current) cameraVideoRef.current.srcObject = streamRef.current;
  }, [cameraConnected, atLiveEdge]);

  const readySegments = useMemo(() => session?.segments.filter((segment) => segment.status === "READY" && segment.playbackUrl) || [], [session?.segments]);
  const selectedSegment = readySegments.find((segment) => segment.id === selectedSegmentId) || null;
  const liveEdgeSeconds = useMemo(() => {
    const segmentEdge = readySegments.reduce((edge, segment) => Math.max(edge, segment.startedAtSeconds + (segment.durationSeconds || 0)), 0);
    if (recording && session?.recordingStartedAt) return Math.max(segmentEdge, (Date.now() - Date.parse(session.recordingStartedAt)) / 1000);
    return segmentEdge;
  }, [readySegments, recording, session?.recordingStartedAt]);
  const myPlaylist = playlists.find((playlist) => playlist.userId === account?.id && playlist.isDefault) || null;

  useEffect(() => {
    presenceStateRef.current = { atLiveEdge, playheadSeconds: atLiveEdge ? liveEdgeSeconds : playheadSeconds };
  }, [atLiveEdge, liveEdgeSeconds, playheadSeconds]);

  useEffect(() => {
    if (!session?.id) return;
    const liveSessionId = session.id;
    const clientId = presenceClientId();
    let stopped = false;
    async function heartbeat() {
      try {
        const presence = presenceStateRef.current;
        const result = await apiFetch<{ liveViewers: LiveViewer[] }>("/api/presence", { method: "POST", body: JSON.stringify({ clientId, liveSessionId, playbackPositionSeconds: presence.playheadSeconds, atLiveEdge: presence.atLiveEdge }) });
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

  useEffect(() => {
    if (cameraConnected || !atLiveEdge || readySegments.length === 0) return;
    setSelectedSegmentId(readySegments[readySegments.length - 1].id);
  }, [atLiveEdge, cameraConnected, readySegments]);

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
      const available = await navigator.mediaDevices.enumerateDevices();
      const cameras = available.filter((device) => device.kind === "videoinput");
      setDevices(cameras);
      const activeDevice = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (activeDevice) setDeviceId(activeDevice);
      setNotice("Camera connected. Start the live session when the match feed is ready.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The camera could not be opened.");
    }
  }

  async function startLive() {
    if (!streamRef.current) {
      await connectCamera();
      if (!streamRef.current) return;
    }
    try {
      const next = await apiFetch<LiveSessionRecord>(`/api/matches/${matchId}/live`, { method: "POST", body: JSON.stringify({ sourceType: "BROWSER_CAMERA" }) });
      setSession(next);
      sequenceRef.current = Math.max(...next.segments.map((segment) => segment.sequence + 1), 0);
      recordingRef.current = true;
      setRecording(true);
      setAtLiveEdge(true);
      void recordNextSegment(next);
      setNotice("Live recording started. Rewinding will not interrupt the camera.");
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
    let prepared: PreparedSegment;
    try {
      prepared = await apiFetch<PreparedSegment>(`/api/live-sessions/${activeSession.id}/segments`, {
        method: "POST",
        body: JSON.stringify({ sequence, startedAtSeconds, mimeType }),
      });
    } catch (error) {
      recordingRef.current = false;
      setRecording(false);
      setNotice(error instanceof Error ? error.message : "The next recording segment could not be prepared.");
      return;
    }
    if (!recordingRef.current || !streamRef.current) return;

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 });
    recorderRef.current = recorder;
    const startedAt = performance.now();
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const durationSeconds = Math.max(0.1, (performance.now() - startedAt) / 1000);
      const blob = new Blob(chunks, { type: mimeType });
      const upload = uploadSegment(activeSession.id, prepared, blob, durationSeconds).catch(async (error) => {
        await apiFetch(`/api/live-sessions/${activeSession.id}/segments/${prepared.id}`, { method: "DELETE" }).catch(() => undefined);
        setNotice(error instanceof Error ? error.message : `Recording segment ${prepared.sequence + 1} failed.`);
      });
      pendingUploadsRef.current.add(upload);
      void upload.finally(() => pendingUploadsRef.current.delete(upload));
      if (recordingRef.current) void recordNextSegment(activeSession);
    };
    recorder.start();
    recorderTimerRef.current = window.setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, SEGMENT_MILLISECONDS);
  }

  async function uploadSegment(liveSessionId: string, prepared: PreparedSegment, blob: Blob, durationSeconds: number) {
    if (!blob.size) return;
    const response = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
    if (!response.ok) throw new Error(`Recording segment ${prepared.sequence + 1} could not be stored.`);
    await apiFetch(`/api/live-sessions/${liveSessionId}/segments/${prepared.id}`, {
      method: "PATCH",
      body: JSON.stringify({ durationSeconds, fileSize: blob.size }),
    });
  }

  async function stopLive() {
    recordingRef.current = false;
    setRecording(false);
    if (recorderTimerRef.current !== null) window.clearTimeout(recorderTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    await Promise.allSettled([...pendingUploadsRef.current]);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraConnected(false);
    try {
      setSession(await apiFetch<LiveSessionRecord>(`/api/matches/${matchId}/live`, { method: "PATCH" }));
      setNotice("The live session ended. Its moments remain available for review.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The live session could not be stopped cleanly.");
    }
  }

  function openSegment(segment: LiveSegmentRecord, offsetSeconds = 0, autoplay = true) {
    setAtLiveEdge(false);
    setSelectedSegmentId(segment.id);
    window.setTimeout(() => {
      const video = replayVideoRef.current;
      if (!video) return;
      const seek = () => {
        video.currentTime = Math.max(0, Math.min(video.duration || Infinity, offsetSeconds));
        if (autoplay) void video.play();
      };
      if (video.readyState >= 1) seek(); else video.addEventListener("loadedmetadata", seek, { once: true });
    }, 0);
  }

  function seekVirtual(seconds: number) {
    const target = Math.max(0, Math.min(liveEdgeSeconds, seconds));
    const segment = [...readySegments].reverse().find((item) => item.startedAtSeconds <= target) || readySegments[0];
    if (!segment) return;
    openSegment(segment, target - segment.startedAtSeconds);
    setPlayheadSeconds(target);
  }

  function goLive() {
    setAtLiveEdge(true);
    setSelectedSegmentId(null);
    setPlayheadSeconds(liveEdgeSeconds);
    if (!cameraConnected) {
      const last = readySegments.at(-1);
      if (last) openSegment(last, Math.max(0, (last.durationSeconds || 0) - 0.25));
      setAtLiveEdge(true);
    }
  }

  function advanceReplay() {
    if (!selectedSegment) return;
    const index = readySegments.findIndex((segment) => segment.id === selectedSegment.id);
    const next = readySegments[index + 1];
    if (next) openSegment(next, 0);
    else if (session?.status === "LIVE") goLive();
  }

  async function markMoment(momentTypeId: string) {
    if (!session) return setNotice("Wait for the live session to start.");
    const markedAtSeconds = atLiveEdge && session.recordingStartedAt ? (Date.now() - Date.parse(session.recordingStartedAt)) / 1000 : playheadSeconds;
    setBusyMomentTypeId(momentTypeId);
    try {
      const saved = await apiFetch<MomentRecord>(`/api/matches/${matchId}/live/moments`, {
        method: "POST",
        body: JSON.stringify({ liveSessionId: session.id, momentTypeId, markedAtSeconds, leadSeconds: 20 }),
      });
      setMatch((current) => current ? { ...current, moments: [...current.moments, saved].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds), momentCount: current.momentCount + 1 } : current);
      const nextPlaylists = await apiFetch<PlaylistRecord[]>("/api/playlists");
      setPlaylists(nextPlaylists);
      setNotice(`${saved.momentType.name} saved from ${formatTime(saved.startTimeSeconds)} to ${formatTime(saved.endTimeSeconds)} and added to your playlist.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The moment could not be saved.");
    } finally {
      setBusyMomentTypeId(null);
    }
  }

  async function updateMoment(input: Record<string, unknown>) {
    if (!editingMoment) return;
    const saved = await apiFetch<MomentRecord>(`/api/moments/${editingMoment.id}`, { method: "PATCH", body: JSON.stringify(input) });
    setMatch((current) => current ? { ...current, moments: current.moments.map((moment) => moment.id === saved.id ? saved : moment).sort((a, b) => a.startTimeSeconds - b.startTimeSeconds) } : current);
    setEditingMoment(null);
    setNotice("The clip timing was updated.");
  }

  if (loading) return <div className="flex min-h-[65vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Preparing Live Game…</div>;
  if (!match || !settings) return <Panel className="border-red-400/20 p-5 text-red-100">{notice || "This match could not be opened."}</Panel>;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} />Matches</Link><div><h1 className="font-semibold text-white">{match.title}</h1><p className="text-xs text-slate-500">Shared live timeline · {myPlaylist?.items.length || 0} clips in your playlist</p></div></div>
      <div className="flex items-center gap-2">{session?.status === "LIVE" ? <Badge className="border-red-400/30 bg-red-500/10 text-red-200"><Radio size={11} className="mr-1 animate-pulse" />LIVE</Badge> : <Badge>Waiting</Badge>}<Badge title={liveViewers.map((viewer) => `${viewer.user.name}${viewer.atLiveEdge ? " · live" : " · replay"}`).join("\n")}><Users size={11} className="mr-1" />{liveViewers.length || (account ? 1 : 0)} watching</Badge></div>
    </div>

    <Panel className="flex flex-wrap items-center gap-2 p-3">
      <Select className="min-w-52 flex-1" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={recording}>{devices.length === 0 ? <option value="">Default camera</option> : devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</Select>
      <Button onClick={() => void connectCamera()} disabled={recording}><Camera size={15} />{cameraConnected ? "Reconnect camera" : "Connect camera"}</Button>
      {!recording ? <Button variant="primary" onClick={() => void startLive()}><Radio size={15} />Start live recording</Button> : <Button variant="danger" onClick={() => void stopLive()}><CircleStop size={15} />End live</Button>}
    </Panel>

    {notice ? <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-2 text-xs text-cyan-50"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={13} /></button></div> : null}

    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel className="overflow-hidden">
        <div className="relative aspect-video bg-black">
          {atLiveEdge && cameraConnected ? <video ref={cameraVideoRef} muted autoPlay playsInline className="h-full w-full object-contain" /> : selectedSegment?.playbackUrl ? <video key={selectedSegment.id} ref={replayVideoRef} src={selectedSegment.playbackUrl} controls autoPlay={atLiveEdge} playsInline className="h-full w-full object-contain" onTimeUpdate={(event) => setPlayheadSeconds(selectedSegment.startedAtSeconds + event.currentTarget.currentTime)} onEnded={advanceReplay} /> : session?.playbackUrl ? <video ref={replayVideoRef} src={session.playbackUrl} controls autoPlay playsInline className="h-full w-full object-contain" /> : <div className="flex h-full flex-col items-center justify-center p-6 text-center"><Video size={48} className="text-cyan-200" /><h2 className="mt-3 font-semibold text-white">{session?.status === "LIVE" ? "Waiting for the first recorded segment" : "Connect the match camera"}</h2><p className="mt-2 max-w-lg text-sm text-slate-500">The camera keeps recording while every staff member rewinds independently.</p></div>}
          {session?.status === "LIVE" ? <span className="absolute left-3 top-3 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold text-white">● LIVE</span> : null}
        </div>
        <div className="border-t border-white/10 p-3">
          <input aria-label="Live recording position" type="range" min={0} max={Math.max(liveEdgeSeconds, 0.1)} step={0.1} value={Math.min(atLiveEdge ? liveEdgeSeconds : playheadSeconds, liveEdgeSeconds)} disabled={readySegments.length === 0} onChange={(event) => seekVirtual(Number(event.target.value))} className="w-full accent-cyan-300" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Button size="sm" disabled={readySegments.length === 0} onClick={() => seekVirtual((atLiveEdge ? liveEdgeSeconds : playheadSeconds) - 20)}><RotateCcw size={14} />Back 20s</Button><Button size="sm" variant="primary" disabled={!session || session.status !== "LIVE"} onClick={goLive}><Radio size={14} />Go Live</Button></div><span className="font-mono text-xs text-slate-300"><Clock3 size={13} className="mr-1 inline text-cyan-200" />{formatTime(atLiveEdge ? liveEdgeSeconds : playheadSeconds)} / {formatTime(liveEdgeSeconds)}</span></div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-white/10 p-3"><p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-500">Tag the previous 20 seconds</p><p className="mt-1 text-xs text-slate-400">The clip can be adjusted afterwards.</p></div>
        <div className="grid grid-cols-2 gap-2 p-3">{settings.momentTypes.filter((type) => type.active).map((type) => <button key={type.id} type="button" disabled={!session || busyMomentTypeId !== null} onClick={() => void markMoment(type.id)} className="min-h-16 rounded-lg border border-white/10 bg-white/[.035] p-2 text-left transition hover:bg-white/[.08] disabled:opacity-40"><span className="block text-xs font-bold" style={{ color: type.color }}>{type.name}</span><span className="mt-1 block text-[10px] text-slate-500">{busyMomentTypeId === type.id ? "Saving…" : "Save −20s → now"}</span></button>)}</div>
        <div className="max-h-72 overflow-y-auto border-t border-white/10">{match.moments.length === 0 ? <p className="p-4 text-xs text-slate-500">Tagged moments will appear here and in your personal playlist.</p> : [...match.moments].reverse().map((moment) => <div key={moment.id} className="flex items-center gap-2 border-b border-white/[.06] px-3 py-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: moment.momentType.color }} /><span className="min-w-0 flex-1"><span className="block truncate text-xs text-white">{moment.momentType.name}</span><span className="block text-[10px] text-slate-500">{formatTime(moment.startTimeSeconds)}–{formatTime(moment.endTimeSeconds)}{moment.createdBy ? ` · ${moment.createdBy.name}` : ""}</span></span><Button size="icon" className="h-7 w-7" title="Adjust clip timing" onClick={() => setEditingMoment(moment)}><Pencil size={11} /></Button></div>)}</div>
      </Panel>
    </div>
    {editingMoment ? <MomentEditDialog moment={editingMoment} momentTypes={settings.momentTypes} currentTime={atLiveEdge ? liveEdgeSeconds : playheadSeconds} duration={liveEdgeSeconds} onSave={updateMoment} onClose={() => setEditingMoment(null)} /> : null}
  </div>;
}
