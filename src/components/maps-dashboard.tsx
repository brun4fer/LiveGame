"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileVideo, Filter, Loader2, MapPinned, Play, Target, Upload } from "lucide-react";

import { GoalSurface, PitchSurface } from "@/components/analysis-surfaces";
import { Badge, Button, Label, Panel, Select } from "@/components/ui";
import type { MapPoint, MatchSummary, SettingsPayload } from "@/lib/domain";
import { apiFetch } from "@/lib/http";
import { getRememberedMatchVideo, rememberMatchVideo } from "@/lib/local-video-store";
import { matchPeriodLabel } from "@/lib/match-periods";
import { getRemoteVideoUrl } from "@/lib/remote-video-store";
import { formatTime } from "@/lib/time";

type MapPeriod = "both" | "first_half" | "second_half";

export function MapsDashboard() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const videoRequestRef = useRef(0);
  const autoPlayRef = useRef(false);
  const playlistActiveRef = useRef(false);
  const advancingRef = useRef(false);
  const remoteUrlsRef = useRef(new Map<string, string>());
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [matchId, setMatchId] = useState("unselected");
  const [momentTypeId, setMomentTypeId] = useState("");
  const [submomentTypeId, setSubmomentTypeId] = useState("");
  const [period, setPeriod] = useState<MapPeriod>("both");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoNotice, setVideoNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiFetch<MapPoint[]>("/api/maps"), apiFetch<MatchSummary[]>("/api/matches"), apiFetch<SettingsPayload>("/api/settings")])
      .then(([mapPoints, matchRows, settingsData]) => { setPoints(mapPoints); setMatches(matchRows); setSettings(settingsData); })
      .catch((caught: Error) => setError(caught.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => () => { videoRequestRef.current += 1; if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const availableSubmomentTypes = useMemo(() => {
    if (!settings) return [];
    if (!momentTypeId) return settings.subMomentTypes;
    const allowedIds = new Set(settings.momentTypes.find((type) => type.id === momentTypeId)?.allowedSubmoments?.map((type) => type.id) || []);
    return settings.subMomentTypes.filter((type) => allowedIds.has(type.id));
  }, [momentTypeId, settings]);

  const hasMatchSelection = matchId !== "unselected";
  const baseFiltered = useMemo(() => !hasMatchSelection ? [] : points.filter((point) =>
    (matchId === "all" || point.matchId === matchId)
    && (!momentTypeId || point.momentTypeId === momentTypeId)
    && (!submomentTypeId || point.subMomentTypeId === submomentTypeId)
  ), [hasMatchSelection, matchId, momentTypeId, points, submomentTypeId]);
  const filtered = useMemo(() => baseFiltered.filter((point) => period === "both" ? point.period !== null : point.period === period), [baseFiltered, period]);
  const selectedPoint = filtered.find((point) => point.id === selectedPointId) || null;
  const selectedClipStart = selectedPoint?.momentStartTimeSeconds ?? 0;
  const selectedClipEnd = selectedPoint?.momentEndTimeSeconds ?? 0;
  const unassignedCount = baseFiltered.filter((point) => point.period === null).length;
  const fieldPoints = filtered.filter((point) => point.fieldX !== null && point.fieldY !== null).map((point) => ({
    id: point.id,
    x: point.fieldX!,
    y: point.fieldY!,
    color: point.color,
    active: point.id === selectedPointId,
    label: point.subMomentTypeName,
    details: [`Moment: ${point.momentTypeName}`, point.timeSeconds === null ? "Time not recorded" : `Time: ${formatTime(point.timeSeconds)}`, `Half: ${matchPeriodLabel(point.period)}`, `Match: ${point.matchTitle}`]
  }));
  const goalPoints = filtered.filter((point) => point.goalX !== null && point.goalY !== null).map((point) => ({
    id: point.id,
    x: point.goalX!,
    y: point.goalY!,
    color: point.color,
    active: point.id === selectedPointId,
    label: point.subMomentTypeName,
    details: [`Moment: ${point.momentTypeName}`, point.timeSeconds === null ? "Time not recorded" : `Time: ${formatTime(point.timeSeconds)}`, `Half: ${matchPeriodLabel(point.period)}`, `Match: ${point.matchTitle}`]
  }));
  useEffect(() => {
    if (!selectedPointId || filtered.some((point) => point.id === selectedPointId)) return;
    playlistActiveRef.current = false;
    advancingRef.current = false;
    setSelectedPointId(null);
    videoRequestRef.current += 1;
    setSourceUrl(null);
    setVideoNotice(null);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, [filtered, selectedPointId]);

  function replaceVideoSource(file: File) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setSourceUrl(objectUrlRef.current);
  }

  async function selectPoint(id: string, fromPlaylist = false) {
    const point = points.find((item) => item.id === id);
    if (!point) return;
    autoPlayRef.current = true;
    playlistActiveRef.current = fromPlaylist;
    if (!fromPlaylist) advancingRef.current = false;
    setSelectedPointId(id);
    setVideoNotice(null);
    setVideoLoading(true);
    setSourceUrl(null);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    const request = ++videoRequestRef.current;
    try {
      const match = matches.find((item) => item.id === point.matchId);
      if (match?.video?.storageStatus === "READY") {
        const cachedUrl = remoteUrlsRef.current.get(point.matchId);
        const remote = cachedUrl ? { url: cachedUrl } : await getRemoteVideoUrl(point.matchId).catch(() => null);
        if (request !== videoRequestRef.current) return;
        if (remote) {
          remoteUrlsRef.current.set(point.matchId, remote.url);
          setSourceUrl(remote.url);
          return;
        }
      }
      const file = await getRememberedMatchVideo(point.matchId);
      if (request !== videoRequestRef.current) return;
      if (file) replaceVideoSource(file);
      else {
        playlistActiveRef.current = false;
        setVideoNotice(match?.video?.storageStatus === "READY" ? "The cloud video could not be loaded. Try again." : `Upload the video for “${point.matchTitle}” from its analysis page.`);
      }
    } catch {
      if (request === videoRequestRef.current) {
        playlistActiveRef.current = false;
        setVideoNotice("The video could not be loaded. Try again.");
      }
    } finally {
      if (request === videoRequestRef.current) setVideoLoading(false);
    }
  }

  async function loadSelectedVideo(file?: File) {
    if (!file || !selectedPoint) return;
    autoPlayRef.current = true;
    advancingRef.current = false;
    replaceVideoSource(file);
    setVideoNotice(null);
    await rememberMatchVideo(selectedPoint.matchId, file).catch(() => setVideoNotice("The video opened, but it may need to be selected again after closing the browser."));
  }

  function changeMomentType(nextId: string) {
    autoPlayRef.current = false;
    playlistActiveRef.current = false;
    videoRef.current?.pause();
    setMomentTypeId(nextId);
    if (!nextId) return;
    const allowedIds = new Set(settings?.momentTypes.find((type) => type.id === nextId)?.allowedSubmoments?.map((type) => type.id) || []);
    if (submomentTypeId && !allowedIds.has(submomentTypeId)) setSubmomentTypeId("");
  }

  function pointsForSubmoment(typeId: string) {
    if (!hasMatchSelection) return [];
    return points.filter((point) =>
      (matchId === "all" || point.matchId === matchId)
      && (!momentTypeId || point.momentTypeId === momentTypeId)
      && point.subMomentTypeId === typeId
      && (period === "both" ? point.period !== null : point.period === period)
    );
  }

  function playAll(nextPoints = filtered) {
    if (!nextPoints.length) return;
    playlistActiveRef.current = true;
    autoPlayRef.current = true;
    advancingRef.current = false;
    void selectPoint(nextPoints[0].id, true);
  }

  function selectActionAndPlay(typeId: string) {
    const nextPoints = pointsForSubmoment(typeId);
    setSubmomentTypeId(typeId);
    if (nextPoints.length) playAll(nextPoints);
    else {
      autoPlayRef.current = false;
      playlistActiveRef.current = false;
      videoRef.current?.pause();
    }
  }

  function finishSelectedClip(video: HTMLVideoElement) {
    if (!selectedPoint || advancingRef.current) return;
    const end = Math.min(video.duration, selectedClipEnd);
    if (video.currentTime < end - .04) return;
    advancingRef.current = true;
    video.pause();
    video.currentTime = end;
    const selectedIndex = filtered.findIndex((point) => point.id === selectedPoint.id);
    if (playlistActiveRef.current && selectedIndex >= 0 && selectedIndex < filtered.length - 1) {
      void selectPoint(filtered[selectedIndex + 1].id, true).finally(() => { advancingRef.current = false; });
    } else {
      playlistActiveRef.current = false;
      advancingRef.current = false;
    }
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Building maps…</div>;
  return <div className="space-y-5">
    <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => { void loadSelectedVideo(event.target.files?.[0]); event.currentTarget.value = ""; }} />
    <div><p className="text-xs font-bold uppercase tracking-[.22em] text-leaf-400">Spatial analysis</p><h1 className="mt-2 text-3xl font-bold text-white">Occurrence maps</h1><p className="mt-2 text-sm text-slate-400">Original coordinates: first-half attacks run left to right and second-half attacks run right to left.</p></div>
    {error ? <Panel className="border-red-400/20 p-4 text-red-100">{error}</Panel> : null}
    <Panel className="grid grid-cols-2 gap-4 p-4 xl:grid-cols-[1fr_1fr_1fr_.8fr_auto_auto] xl:items-end">
      <label className="grid gap-2"><Label>Match</Label><Select value={matchId} onChange={(event) => { autoPlayRef.current = false; playlistActiveRef.current = false; videoRef.current?.pause(); setMatchId(event.target.value); }}><option value="unselected" disabled>Select a match</option><option value="all">All matches</option>{matches.map((match) => <option key={match.id} value={match.id}>{match.title}</option>)}</Select></label>
      <label className="grid gap-2"><Label>Moment</Label><Select value={momentTypeId} onChange={(event) => changeMomentType(event.target.value)}><option value="">All moments</option>{settings?.momentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></label>
      <label className="grid gap-2"><Label>Submoment</Label><Select value={submomentTypeId} onChange={(event) => { autoPlayRef.current = false; playlistActiveRef.current = false; videoRef.current?.pause(); setSubmomentTypeId(event.target.value); }}><option value="">All submoments</option>{availableSubmomentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></label>
      <label className="grid gap-2"><Label>Match period</Label><Select value={period} onChange={(event) => { autoPlayRef.current = false; playlistActiveRef.current = false; videoRef.current?.pause(); setPeriod(event.target.value as MapPeriod); }}><option value="both">Both halves</option><option value="first_half">1st half</option><option value="second_half">2nd half</option></Select></label>
      <div className="grid gap-1"><Badge className="h-10 justify-center px-4"><Filter size={14} className="mr-2" />{hasMatchSelection ? `${filtered.length} occurrences` : "Select a match"}</Badge>{unassignedCount > 0 ? <span className="text-center text-[10px] text-amber-200">{unassignedCount} awaiting period markers</span> : null}</div>
      <Button className="h-10" variant="primary" disabled={!filtered.length || videoLoading} onClick={() => playAll()}><Play size={15} />Play all</Button>
    </Panel>
    <div className="maps-surfaces grid grid-cols-[minmax(0,1.35fr)_minmax(0,.65fr)] items-start gap-2 sm:gap-5">
      <Panel className="min-w-0 p-2 sm:p-4"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><Label>Pitch</Label><p className="mt-1 truncate text-[10px] text-slate-500 sm:text-xs">{hasMatchSelection ? "Points remain in their original match coordinates." : "Select a match above to display its locations."}</p></div><MapPinned className="shrink-0 text-leaf-400" /></div><PitchSurface className="mt-3 sm:mt-4" points={fieldPoints} onPointSelect={(id) => void selectPoint(id)} /></Panel>
      <div className="min-w-0 space-y-2 sm:space-y-5">
        <Panel className="p-2 sm:p-4"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><Label>Goal</Label><p className="mt-1 truncate text-[10px] text-slate-500 sm:text-xs">{hasMatchSelection ? "Shot and action destinations." : "Select a match above to display its goal locations."}</p></div><Target className="shrink-0 text-fire-400" /></div><GoalSurface className="mt-3 sm:mt-4" points={goalPoints} onPointSelect={(id) => void selectPoint(id)} /></Panel>
        <Panel className="overflow-hidden">
          <div className="border-b border-white/10 p-2 sm:p-3"><Label>Selected moment video</Label>{selectedPoint ? <p className="mt-1 truncate text-[10px] text-slate-500 sm:text-xs">{selectedPoint.matchTitle} · {selectedPoint.momentTypeName} / {selectedPoint.subMomentTypeName} · {formatTime(selectedClipStart)}–{formatTime(selectedClipEnd)}</p> : null}</div>
          <div className="relative aspect-video bg-black">{sourceUrl && selectedPoint ? <video
            key={`${sourceUrl}-${selectedPoint.id}`}
            ref={videoRef}
            src={sourceUrl}
            crossOrigin="anonymous"
            controls
            playsInline
            className="h-full w-full object-contain"
            onLoadedMetadata={(event) => {
              const end = Math.min(event.currentTarget.duration, selectedClipEnd);
              event.currentTarget.currentTime = Math.min(selectedClipStart, end);
              if (autoPlayRef.current) void event.currentTarget.play();
            }}
            onPlay={(event) => {
              autoPlayRef.current = true;
              const end = Math.min(event.currentTarget.duration, selectedClipEnd);
              if (event.currentTarget.currentTime < selectedClipStart || event.currentTarget.currentTime >= end) event.currentTarget.currentTime = Math.min(selectedClipStart, end);
            }}
            onPause={(event) => {
              const end = Math.min(event.currentTarget.duration, selectedClipEnd);
              if (!advancingRef.current && event.currentTarget.currentTime < end - .04) {
                autoPlayRef.current = false;
                playlistActiveRef.current = false;
              }
            }}
            onSeeking={(event) => {
              const end = Math.min(event.currentTarget.duration, selectedClipEnd);
              if (event.currentTarget.currentTime < selectedClipStart) event.currentTarget.currentTime = selectedClipStart;
              else if (event.currentTarget.currentTime > end) event.currentTarget.currentTime = end;
            }}
            onTimeUpdate={(event) => finishSelectedClip(event.currentTarget)}
          /> : <div className="flex h-full flex-col items-center justify-center p-2 text-center sm:p-5"><FileVideo className="text-leaf-400" size={28} />{videoLoading ? <p className="mt-2 text-xs text-slate-400">Loading video…</p> : selectedPoint ? <><p className="mt-2 text-[10px] text-slate-400 sm:text-xs">{videoNotice || "Upload this match video from the analysis page."}</p>{matches.find((item) => item.id === selectedPoint.matchId)?.video?.storageStatus !== "READY" ? <Button className="mt-2" size="sm" onClick={() => fileInputRef.current?.click()}><Upload size={13} />Use local file</Button> : null}</> : <p className="mt-2 text-[10px] text-slate-500 sm:text-xs">Select a point on the pitch or goal.</p>}</div>}</div>
        </Panel>
      </div>
    </div>
    <Panel className="p-4"><div className="flex items-center justify-between gap-3"><div><Label>Actions</Label><p className="mt-1 text-[10px] text-slate-500">Select an action to play all of its occurrences.</p></div>{submomentTypeId ? <Button size="sm" onClick={() => { autoPlayRef.current = false; playlistActiveRef.current = false; videoRef.current?.pause(); setSubmomentTypeId(""); }}>Show all</Button> : null}</div><div className="mt-3 flex flex-wrap gap-2">{availableSubmomentTypes.map((type) => { const count = pointsForSubmoment(type.id).length; const active = submomentTypeId === type.id; return <button type="button" key={type.id} disabled={!count} onClick={() => selectActionAndPlay(type.id)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-white/[.12] text-white ring-1 ring-white/20" : "border-white/10 bg-white/[.04] text-slate-300 hover:bg-white/[.09]"}`} style={active ? { borderColor: type.color } : undefined}><span className="h-3 w-3 rounded-full" style={{ backgroundColor: type.color }} />{type.name}<strong className="text-white">{count}</strong><Play size={11} className="text-slate-500" /></button>; })}</div></Panel>
  </div>;
}

