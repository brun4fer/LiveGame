"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CircleStop, Clock3, ListVideo, Play, Radio, RotateCcw, Trash2, Video, X } from "lucide-react";

import { Badge, Button, Input, Panel } from "@/components/ui";
import { formatTime } from "@/lib/time";

const SEGMENT_MS = 5_000;
const momentTypes = [
  { id: "org-of", name: "Offensive Organization", color: "#2dd66f" },
  { id: "org-def", name: "Defensive Organization", color: "#38bdf8" },
  { id: "trans-of", name: "Offensive Transition", color: "#f59e0b" },
  { id: "trans-def", name: "Defensive Transition", color: "#ef4444" },
  { id: "set-of", name: "Offensive Set Pieces", color: "#ec4899" },
  { id: "set-def", name: "Defensive Set Pieces", color: "#a78bfa" },
];

type DemoSegment = { id: string; url: string; startedAtSeconds: number; durationSeconds: number };
type DemoMoment = { id: string; typeId: string; startTimeSeconds: number; endTimeSeconds: number };

function recorderMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "video/webm";
}

export function LiveDemo() {
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const replayRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const urlsRef = useRef<string[]>([]);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [segments, setSegments] = useState<DemoSegment[]>([]);
  const [moments, setMoments] = useState<DemoMoment[]>([]);
  const [atLiveEdge, setAtLiveEdge] = useState(true);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [notice, setNotice] = useState("This demo stores everything temporarily in this browser tab.");

  const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId) || null;
  const liveEdge = useMemo(() => {
    const recordedEdge = segments.reduce((edge, segment) => Math.max(edge, segment.startedAtSeconds + segment.durationSeconds), 0);
    return recording ? Math.max(recordedEdge, (Date.now() - startedAtRef.current) / 1000) : recordedEdge;
  }, [recording, segments]);

  useEffect(() => {
    if (cameraRef.current && streamRef.current) cameraRef.current.srcObject = streamRef.current;
  }, [atLiveEdge, cameraConnected]);

  useEffect(() => () => {
    recordingRef.current = false;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function connectCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return setNotice("Camera capture is not supported by this browser.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: true });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setCameraConnected(true);
      setAtLiveEdge(true);
      setNotice("Camera connected. You can now start the local demonstration.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The camera could not be opened.");
    }
  }

  async function start() {
    if (!streamRef.current) {
      await connectCamera();
      if (!streamRef.current) return;
    }
    startedAtRef.current = Date.now();
    recordingRef.current = true;
    setRecording(true);
    setAtLiveEdge(true);
    recordNext();
    setNotice("Demo recording started. Wait five seconds for the first replay segment.");
  }

  function recordNext() {
    const stream = streamRef.current;
    if (!stream || !recordingRef.current) return;
    const mimeType = recorderMimeType();
    const chunks: BlobPart[] = [];
    const segmentStart = (Date.now() - startedAtRef.current) / 1000;
    const performanceStart = performance.now();
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size) {
        const url = URL.createObjectURL(blob);
        urlsRef.current.push(url);
        setSegments((current) => [...current, { id: crypto.randomUUID(), url, startedAtSeconds: segmentStart, durationSeconds: Math.max(0.1, (performance.now() - performanceStart) / 1000) }]);
      }
      if (recordingRef.current) recordNext();
    };
    recorder.start();
    timerRef.current = window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, SEGMENT_MS);
  }

  function stop() {
    recordingRef.current = false;
    setRecording(false);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraConnected(false);
    setNotice("Demo recording stopped. Temporary clips remain available until this page is refreshed.");
  }

  function openSegment(segment: DemoSegment, offset = 0, stayLive = false) {
    setAtLiveEdge(stayLive);
    setSelectedSegmentId(segment.id);
    setPlayheadSeconds(segment.startedAtSeconds + offset);
    window.setTimeout(() => {
      const video = replayRef.current;
      if (!video) return;
      const seek = () => { video.currentTime = Math.max(0, Math.min(video.duration || Infinity, offset)); void video.play(); };
      if (video.readyState >= 1) seek(); else video.addEventListener("loadedmetadata", seek, { once: true });
    }, 0);
  }

  function seek(seconds: number) {
    const target = Math.max(0, Math.min(liveEdge, seconds));
    const segment = [...segments].reverse().find((candidate) => candidate.startedAtSeconds <= target) || segments[0];
    if (segment) openSegment(segment, target - segment.startedAtSeconds);
  }

  function goLive() {
    if (cameraConnected) {
      setAtLiveEdge(true);
      setSelectedSegmentId(null);
      setPlayheadSeconds(liveEdge);
      return;
    }
    const last = segments.at(-1);
    if (last) openSegment(last, Math.max(0, last.durationSeconds - 0.2), true);
  }

  function advanceReplay() {
    if (!selectedSegment) return;
    const index = segments.findIndex((segment) => segment.id === selectedSegment.id);
    const next = segments[index + 1];
    if (next) openSegment(next);
    else if (recording) goLive();
  }

  function mark(typeId: string) {
    const end = atLiveEdge ? (Date.now() - startedAtRef.current) / 1000 : playheadSeconds;
    if (!recording && segments.length === 0) return setNotice("Start the demo recording before tagging a moment.");
    const moment = { id: crypto.randomUUID(), typeId, startTimeSeconds: Math.max(0, end - 20), endTimeSeconds: end };
    setMoments((current) => [...current, moment]);
    const type = momentTypes.find((candidate) => candidate.id === typeId)!;
    setNotice(type.name + " saved to the demo playlist: " + formatTime(moment.startTimeSeconds) + "–" + formatTime(moment.endTimeSeconds) + ".");
  }

  function updateMoment(id: string, field: "startTimeSeconds" | "endTimeSeconds", value: string) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return;
    setMoments((current) => current.map((moment) => moment.id === id ? { ...moment, [field]: seconds } : moment));
  }

  return <main className="min-h-screen bg-pitch-950 px-3 py-4 text-white sm:px-5">
    <div className="mx-auto max-w-[1500px] space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.24em] text-cyan-300">Database-free preview</p><h1 className="mt-1 text-2xl font-bold">Live Game · Demo Match</h1><p className="mt-1 text-sm text-slate-400">Local camera, continuous replay, −20 second tagging and personal playlist.</p></div><Badge className="border-amber-300/25 bg-amber-300/10 text-amber-100">Temporary demo</Badge></header>
      {notice ? <div className="flex items-center justify-between rounded-lg border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-2 text-xs text-cyan-50"><span>{notice}</span><button onClick={() => setNotice("")}><X size={13} /></button></div> : null}
      <Panel className="flex flex-wrap gap-2 p-3"><Button onClick={() => void connectCamera()} disabled={recording}><Camera size={15} />{cameraConnected ? "Reconnect camera" : "Connect camera"}</Button>{!recording ? <Button variant="primary" onClick={() => void start()}><Radio size={15} />Start demo recording</Button> : <Button variant="danger" onClick={stop}><CircleStop size={15} />Stop demo</Button>}<span className="ml-auto self-center text-xs text-slate-500">No account, database or cloud storage</span></Panel>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel className="overflow-hidden"><div className="relative aspect-video bg-black">{atLiveEdge && cameraConnected ? <video ref={cameraRef} autoPlay muted playsInline className="h-full w-full object-contain" /> : selectedSegment ? <video key={selectedSegment.id} ref={replayRef} src={selectedSegment.url} controls autoPlay playsInline className="h-full w-full object-contain" onTimeUpdate={(event) => setPlayheadSeconds(selectedSegment.startedAtSeconds + event.currentTarget.currentTime)} onEnded={advanceReplay} /> : <div className="flex h-full flex-col items-center justify-center text-center"><Video size={48} className="text-cyan-200" /><p className="mt-3 text-sm text-slate-400">Connect a camera to begin.</p></div>}{recording ? <span className="absolute left-3 top-3 rounded bg-red-600 px-2 py-1 text-[10px] font-bold">● LIVE</span> : null}</div><div className="border-t border-white/10 p-3"><input type="range" aria-label="Demo recording position" min={0} max={Math.max(0.1, liveEdge)} step={0.1} value={Math.min(atLiveEdge ? liveEdge : playheadSeconds, liveEdge)} disabled={segments.length === 0} onChange={(event) => seek(Number(event.target.value))} className="w-full accent-cyan-300" /><div className="mt-2 flex items-center justify-between gap-2"><div className="flex gap-2"><Button size="sm" disabled={segments.length === 0} onClick={() => seek((atLiveEdge ? liveEdge : playheadSeconds) - 20)}><RotateCcw size={14} />Back 20s</Button><Button size="sm" variant="primary" disabled={!recording && segments.length === 0} onClick={goLive}><Radio size={14} />Go Live</Button></div><span className="font-mono text-xs text-slate-300"><Clock3 size={13} className="mr-1 inline" />{formatTime(atLiveEdge ? liveEdge : playheadSeconds)} / {formatTime(liveEdge)}</span></div></div></Panel>
        <Panel className="overflow-hidden"><div className="border-b border-white/10 p-3"><p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">Tag previous 20 seconds</p></div><div className="grid grid-cols-2 gap-2 p-3">{momentTypes.map((type) => <button key={type.id} onClick={() => mark(type.id)} className="min-h-16 rounded-lg border border-white/10 bg-white/[.035] p-2 text-left hover:bg-white/[.08]"><span className="block text-xs font-bold" style={{ color: type.color }}>{type.name}</span><span className="mt-1 block text-[10px] text-slate-500">Save −20s → now</span></button>)}</div></Panel>
      </div>
      <Panel className="overflow-hidden"><div className="flex items-center justify-between border-b border-white/10 p-3"><div><p className="font-semibold">My demo playlist</p><p className="text-xs text-slate-500">Adjust the clip boundaries directly below.</p></div><Badge><ListVideo size={11} className="mr-1" />{moments.length} clips</Badge></div>{moments.length === 0 ? <div className="p-6 text-center text-sm text-slate-500">Tagged moments will appear here.</div> : <div className="divide-y divide-white/[.06]">{moments.map((moment, index) => { const type = momentTypes.find((candidate) => candidate.id === moment.typeId)!; return <div key={moment.id} className="flex flex-wrap items-center gap-3 p-3"><span className="w-5 text-right font-mono text-xs text-slate-600">{index + 1}</span><span className="h-3 w-3 rounded-full" style={{ backgroundColor: type.color }} /><span className="min-w-44 flex-1 text-sm font-semibold">{type.name}</span><label className="flex items-center gap-2 text-xs text-slate-500">Start<Input className="h-8 w-24 font-mono text-xs" type="number" min={0} step={0.1} value={moment.startTimeSeconds.toFixed(1)} onChange={(event) => updateMoment(moment.id, "startTimeSeconds", event.target.value)} /></label><label className="flex items-center gap-2 text-xs text-slate-500">End<Input className="h-8 w-24 font-mono text-xs" type="number" min={0} step={0.1} value={moment.endTimeSeconds.toFixed(1)} onChange={(event) => updateMoment(moment.id, "endTimeSeconds", event.target.value)} /></label><Button size="sm" onClick={() => { const segment = [...segments].reverse().find((candidate) => candidate.startedAtSeconds <= moment.startTimeSeconds) || segments[0]; if (segment) openSegment(segment, moment.startTimeSeconds - segment.startedAtSeconds); }}><Play size={12} />Review</Button><Button size="icon" variant="danger" className="h-8 w-8" onClick={() => setMoments((current) => current.filter((candidate) => candidate.id !== moment.id))}><Trash2 size={12} /></Button></div>; })}</div>}</Panel>
    </div>
  </main>;
}
