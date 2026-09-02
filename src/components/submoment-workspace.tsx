"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Cloud, Crosshair, FileVideo, Goal, Loader2, MapPin, Pause, Pencil, Play, Save, Trash2, Upload, X } from "lucide-react";

import { Coordinate, GoalSurface, PitchSurface } from "@/components/analysis-surfaces";
import { CloudVideoLibrary } from "@/components/cloud-video-library";
import { Badge, Button, Label, Panel, Select, TextArea } from "@/components/ui";
import type { LiveSessionRecord, MatchDetail, MomentRecord, SettingsPayload, SubMomentRecord } from "@/lib/domain";
import { apiFetch } from "@/lib/http";
import { locateReplayPosition } from "@/lib/live-replay";
import { getRememberedMatchVideo, rememberMatchVideo } from "@/lib/local-video-store";
import { getMatchPeriodAtTime, matchPeriodLabel } from "@/lib/match-periods";
import { attachCloudVideo, getCloudVideoLibrary, getRemoteVideoUrl, uploadMatchVideo, type CloudVideoAsset } from "@/lib/remote-video-store";
import { formatBytes, formatTime, roundTime } from "@/lib/time";

export function SubmomentWorkspace({ matchId }: { matchId: string }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const playlistActiveRef = useRef(false);
  const advancingRef = useRef(false);
  const replayCommandRef = useRef(0);
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [usingLiveRecording, setUsingLiveRecording] = useState(false);
  const [liveSession, setLiveSession] = useState<LiveSessionRecord | null>(null);
  const [liveReplayTarget, setLiveReplayTarget] = useState<{ segmentId: string; offsetSeconds: number; autoplay: boolean; command: number } | null>(null);
  const [restoringVideo, setRestoringVideo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterTypeId, setFilterTypeId] = useState("");
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const [selectedSubMomentTypeId, setSelectedSubMomentTypeId] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [fieldPoint, setFieldPoint] = useState<Coordinate | null>(null);
  const [goalPoint, setGoalPoint] = useState<Coordinate | null>(null);
  const [foot, setFoot] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingSubmomentId, setEditingSubmomentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showCloudLibrary, setShowCloudLibrary] = useState(false);
  const [cloudAssets, setCloudAssets] = useState<CloudVideoAsset[]>([]);
  const [loadingCloudLibrary, setLoadingCloudLibrary] = useState(false);
  const [cloudLibraryError, setCloudLibraryError] = useState<string | null>(null);
  const [attachingAssetId, setAttachingAssetId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<MatchDetail>(`/api/matches/${matchId}`),
      apiFetch<SettingsPayload>("/api/settings"),
      apiFetch<LiveSessionRecord | null>(`/api/matches/${matchId}/live`),
    ])
      .then(async ([matchData, settingsData, sessionData]) => {
        if (!active) return;
        playlistActiveRef.current = true;
        setMatch(matchData);
        setSettings(settingsData);
        setLiveSession(sessionData);
        setSelectedMomentId(matchData.moments[0]?.id || null);
        if (matchData.video?.storageStatus === "READY") {
          const remote = await getRemoteVideoUrl(matchId).catch(() => null);
          if (active && remote) {
            setSourceUrl(remote.url);
            setUsingLiveRecording(false);
            return;
          }
        }
        const file = await getRememberedMatchVideo(matchId).catch(() => null);
        if (active && file) {
          setSourceUrl(URL.createObjectURL(file));
          setUsingLiveRecording(false);
          return;
        }
        const readySegments = sessionData?.segments.filter((segment) => segment.status === "READY" && segment.playbackUrl) || [];
        if (active && readySegments.length > 0) {
          const position = locateReplayPosition(readySegments, matchData.moments[0]?.startTimeSeconds || 0);
          setUsingLiveRecording(true);
          if (position) setLiveReplayTarget({ segmentId: position.segment.id, offsetSeconds: position.offsetSeconds, autoplay: false, command: ++replayCommandRef.current });
        }
      })
      .catch((error: Error) => setNotice(error.message))
      .finally(() => {
        if (active) {
          setLoading(false);
          setRestoringVideo(false);
        }
      });
    return () => { active = false; };
  }, [matchId]);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  const moments = useMemo(() => (match?.moments || []).filter((moment) => !filterTypeId || moment.momentTypeId === filterTypeId), [filterTypeId, match?.moments]);
  const liveSegments = useMemo(() => liveSession?.segments.filter((segment) => segment.status === "READY" && segment.playbackUrl).sort((a, b) => a.sequence - b.sequence) || [], [liveSession?.segments]);
  const selectedLiveSegment = liveSegments.find((segment) => segment.id === liveReplayTarget?.segmentId) || null;
  const videoSourceUrl = usingLiveRecording ? selectedLiveSegment?.playbackUrl || null : sourceUrl;
  const hasVideoSource = Boolean(videoSourceUrl);
  const selectedIndex = moments.findIndex((moment) => moment.id === selectedMomentId);
  const selectedMoment = selectedIndex >= 0 ? moments[selectedIndex] : moments[0] || null;
  const selectedMomentType = settings?.momentTypes.find((type) => type.id === selectedMoment?.momentTypeId) || null;
  const allowedSubmomentIds = useMemo(() => new Set(selectedMomentType?.allowedSubmoments?.map((type) => type.id) || []), [selectedMomentType]);
  const availableSubmomentTypes = useMemo(() => (settings?.subMomentTypes || []).filter((type) => type.active && allowedSubmomentIds.has(type.id)), [allowedSubmomentIds, settings?.subMomentTypes]);
  const selectedSubMomentType = availableSubmomentTypes.find((type) => type.id === selectedSubMomentTypeId) || null;
  const directionTime = selectedMoment ? Math.min(selectedMoment.endTimeSeconds, Math.max(selectedMoment.startTimeSeconds, currentTime)) : currentTime;
  const selectedPeriod = match ? getMatchPeriodAtTime(match, directionTime) : null;
  const fieldMarkers = useMemo(() => (selectedMoment?.subMoments || []).filter((sub) => sub.fieldX !== null && sub.fieldY !== null).map((sub) => ({ id: sub.id, x: sub.fieldX!, y: sub.fieldY!, color: sub.subMomentType.color, label: sub.subMomentType.name, details: [sub.timeSeconds === null ? "Time not recorded" : `Time: ${formatTime(sub.timeSeconds)}`, `Match: ${match?.title || "Unknown"}`] })), [match?.title, selectedMoment]);
  const goalMarkers = useMemo(() => (selectedMoment?.subMoments || []).filter((sub) => sub.goalX !== null && sub.goalY !== null).map((sub) => ({ id: sub.id, x: sub.goalX!, y: sub.goalY!, color: sub.subMomentType.color, label: sub.subMomentType.name, details: [sub.timeSeconds === null ? "Time not recorded" : `Time: ${formatTime(sub.timeSeconds)}`, `Match: ${match?.title || "Unknown"}`] })), [match?.title, selectedMoment]);

  function seekToTime(seconds: number, autoplay: boolean) {
    if (usingLiveRecording) {
      const position = locateReplayPosition(liveSegments, seconds);
      if (!position) return false;
      setCurrentTime(position.virtualSeconds);
      setLiveReplayTarget({ segmentId: position.segment.id, offsetSeconds: position.offsetSeconds, autoplay, command: ++replayCommandRef.current });
      return true;
    }
    const video = videoRef.current;
    if (!video || !sourceUrl) return false;
    video.currentTime = seconds;
    setCurrentTime(seconds);
    if (autoplay) void video.play();
    else video.pause();
    return true;
  }

  useEffect(() => {
    if (!selectedMoment) return;
    advancingRef.current = false;
    setCurrentTime(selectedMoment.startTimeSeconds);
    setFieldPoint(null);
    setGoalPoint(null);
    setEditingSubmomentId(null);
    void seekToTime(selectedMoment.startTimeSeconds, playlistActiveRef.current);
  }, [selectedMoment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const video = videoRef.current;
    if (usingLiveRecording || !sourceUrl || !selectedMoment || !video) return;
    const startSelectedMoment = () => {
      video.playbackRate = playbackRate;
      video.currentTime = selectedMoment.startTimeSeconds;
      setCurrentTime(selectedMoment.startTimeSeconds);
      if (playlistActiveRef.current) void video.play();
    };
    if (video.readyState >= 1) startSelectedMoment();
    else video.addEventListener("loadedmetadata", startSelectedMoment, { once: true });
    return () => video.removeEventListener("loadedmetadata", startSelectedMoment);
  }, [sourceUrl, usingLiveRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!usingLiveRecording || !selectedLiveSegment || !liveReplayTarget) return;
    const video = videoRef.current;
    if (!video) return;
    const applyTarget = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : selectedLiveSegment.durationSeconds || 0;
      video.currentTime = Math.max(0, Math.min(Math.max(0, duration - 0.02), liveReplayTarget.offsetSeconds));
      video.playbackRate = playbackRate;
      if (liveReplayTarget.autoplay) void video.play();
      else video.pause();
    };
    if (video.readyState >= 1) applyTarget();
    else video.addEventListener("loadedmetadata", applyTarget, { once: true });
    return () => video.removeEventListener("loadedmetadata", applyTarget);
  }, [liveReplayTarget, playbackRate, selectedLiveSegment, usingLiveRecording]);

  useEffect(() => {
    if (availableSubmomentTypes.some((type) => type.id === selectedSubMomentTypeId)) return;
    setSelectedSubMomentTypeId(availableSubmomentTypes[0]?.id || "");
    setFieldPoint(null);
    setGoalPoint(null);
    setEditingSubmomentId(null);
  }, [availableSubmomentTypes, selectedSubMomentTypeId]);

  async function loadVideo(file?: File) {
    if (!file) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(URL.createObjectURL(file));
    setUsingLiveRecording(false);
    setLiveReplayTarget(null);
    await rememberMatchVideo(matchId, file).catch(() => undefined);
    setUploading(true);
    setUploadProgress(0);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    try {
      const result = await uploadMatchVideo(matchId, file, ({ progress, detail }) => {
        setUploadProgress(progress);
        setNotice(`${detail} ${Math.round(progress * 100)}%`);
      }, controller.signal);
      const [remote, savedMatch] = await Promise.all([
        getRemoteVideoUrl(matchId),
        apiFetch<MatchDetail>(`/api/matches/${matchId}`),
      ]);
      setSourceUrl(remote.url);
      setUsingLiveRecording(false);
      setLiveReplayTarget(null);
      setMatch(savedMatch);
      setNotice(result.resumed ? "Video upload resumed and completed successfully." : "Video stored securely in Cloudflare R2.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The video could not be uploaded.");
    } finally {
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
      setUploading(false);
    }
  }

  async function openCloudLibrary() {
    setShowCloudLibrary(true);
    setLoadingCloudLibrary(true);
    setCloudLibraryError(null);
    try {
      const result = await getCloudVideoLibrary();
      setCloudAssets(result.assets);
    } catch (error) {
      setCloudLibraryError(error instanceof Error ? error.message : "Could not load the cloud library.");
    } finally {
      setLoadingCloudLibrary(false);
    }
  }

  async function attachSelectedCloudVideo(asset: CloudVideoAsset) {
    setAttachingAssetId(asset.id);
    setCloudLibraryError(null);
    try {
      await attachCloudVideo(matchId, asset.id);
      const [remote, savedMatch] = await Promise.all([
        getRemoteVideoUrl(matchId),
        apiFetch<MatchDetail>(`/api/matches/${matchId}`),
      ]);
      setSourceUrl(remote.url);
      setUsingLiveRecording(false);
      setLiveReplayTarget(null);
      setMatch(savedMatch);
      setShowCloudLibrary(false);
      setNotice(`Using ${asset.fileName} from the shared cloud library.`);
    } catch (error) {
      setCloudLibraryError(error instanceof Error ? error.message : "Could not attach the selected cloud video.");
    } finally {
      setAttachingAssetId(null);
    }
  }

  function selectMoment(moment: MomentRecord) {
    playlistActiveRef.current = true;
    advancingRef.current = false;
    if (moment.id !== selectedMoment?.id) {
      setSelectedMomentId(moment.id);
      return;
    }
    void seekToTime(moment.startTimeSeconds, true);
  }

  function changeFilter(typeId: string) {
    setFilterTypeId(typeId);
    const first = match?.moments.find((moment) => !typeId || moment.momentTypeId === typeId) || null;
    playlistActiveRef.current = Boolean(first);
    advancingRef.current = false;
    if (!first) {
      setSelectedMomentId(null);
      videoRef.current?.pause();
      return;
    }
    selectMoment(first);
  }

  function playAllMoments() {
    const first = moments[0];
    if (!first || !hasVideoSource) return;
    playlistActiveRef.current = true;
    advancingRef.current = false;
    selectMoment(first);
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video || !selectedMoment) return;
    if (!video.paused) {
      playlistActiveRef.current = false;
      video.pause();
      return;
    }
    playlistActiveRef.current = true;
    if (currentTime < selectedMoment.startTimeSeconds || currentTime >= selectedMoment.endTimeSeconds) {
      void seekToTime(selectedMoment.startTimeSeconds, true);
      return;
    }
    void video.play();
  }

  function setRate(rate: number) {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video || !selectedMoment) return;
    const nextTime = usingLiveRecording && selectedLiveSegment ? selectedLiveSegment.startedAtSeconds + video.currentTime : video.currentTime;
    setCurrentTime(nextTime);
    if (nextTime < selectedMoment.endTimeSeconds - .04 || advancingRef.current) return;
    advancingRef.current = true;
    video.pause();
    setCurrentTime(selectedMoment.endTimeSeconds);
    if (playlistActiveRef.current && selectedIndex >= 0 && selectedIndex < moments.length - 1) {
      setSelectedMomentId(moments[selectedIndex + 1].id);
    } else {
      playlistActiveRef.current = false;
      advancingRef.current = false;
    }
  }

  function handleVideoEnded() {
    if (!usingLiveRecording || !selectedLiveSegment || !selectedMoment || advancingRef.current) return;
    const index = liveSegments.findIndex((segment) => segment.id === selectedLiveSegment.id);
    const next = liveSegments[index + 1];
    if (next && next.startedAtSeconds < selectedMoment.endTimeSeconds) {
      void seekToTime(next.startedAtSeconds, true);
      return;
    }
    advancingRef.current = true;
    setCurrentTime(selectedMoment.endTimeSeconds);
    if (playlistActiveRef.current && selectedIndex >= 0 && selectedIndex < moments.length - 1) setSelectedMomentId(moments[selectedIndex + 1].id);
    else {
      playlistActiveRef.current = false;
      advancingRef.current = false;
    }
  }

  function chooseSubMomentType(typeId: string) {
    playlistActiveRef.current = false;
    setSelectedSubMomentTypeId(typeId);
    setFieldPoint(null);
    setGoalPoint(null);
    videoRef.current?.pause();
    setEditingSubmomentId(null);
  }

  function editSubmoment(submoment: SubMomentRecord) {
    playlistActiveRef.current = false;
    setEditingSubmomentId(submoment.id);
    setSelectedSubMomentTypeId(submoment.subMomentTypeId);
    setFieldPoint(submoment.fieldX !== null && submoment.fieldY !== null ? { x: submoment.fieldX, y: submoment.fieldY } : null);
    setGoalPoint(submoment.goalX !== null && submoment.goalY !== null ? { x: submoment.goalX, y: submoment.goalY } : null);
    setFoot(submoment.foot || "");
    setNotes(submoment.notes || "");
    if (submoment.timeSeconds !== null) {
      void seekToTime(submoment.timeSeconds, false);
    }
    videoRef.current?.pause();
  }

  function cancelSubmomentEdit() {
    setEditingSubmomentId(null);
    setFieldPoint(null); setGoalPoint(null); setFoot(""); setNotes("");
  }

  async function saveSubmoment() {
    if (!match || !selectedMoment || !selectedSubMomentType) return;
    if (selectedSubMomentType.requiresFieldLocation && !fieldPoint) {
      setNotice("Mark the occurrence location on the pitch.");
      return;
    }
    if (selectedSubMomentType.requiresGoalLocation && !goalPoint) {
      setNotice("Also mark the location on the goal.");
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const eventTime = Math.min(selectedMoment.endTimeSeconds, Math.max(selectedMoment.startTimeSeconds, currentTime));
      const saved = await apiFetch<SubMomentRecord>(editingSubmomentId ? `/api/submoments/${editingSubmomentId}` : `/api/moments/${selectedMoment.id}/submoments`, {
        method: editingSubmomentId ? "PATCH" : "POST",
        body: JSON.stringify({
          subMomentTypeId: selectedSubMomentType.id,
          timeSeconds: roundTime(eventTime),
          fieldX: fieldPoint?.x ?? null,
          fieldY: fieldPoint?.y ?? null,
          goalX: goalPoint?.x ?? null,
          goalY: goalPoint?.y ?? null,
          foot: foot || null,
          notes: notes || null
        })
      });
      setMatch({ ...match, moments: match.moments.map((moment) => moment.id === selectedMoment.id ? { ...moment, subMoments: editingSubmomentId ? moment.subMoments.map((item) => item.id === saved.id ? saved : item) : [...moment.subMoments, saved] } : moment) });
      setEditingSubmomentId(null);
      setFieldPoint(null);
      setGoalPoint(null);
      setFoot("");
      setNotes("");
      setNotice(`${selectedSubMomentType.name} ${editingSubmomentId ? "updated" : "saved"} at ${formatTime(eventTime)}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the submoment.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSubmoment(submoment: SubMomentRecord) {
    if (!match || !selectedMoment || !confirm(`Delete ${submoment.subMomentType.name}?`)) return;
    try {
      await apiFetch(`/api/submoments/${submoment.id}`, { method: "DELETE" });
      setMatch({ ...match, moments: match.moments.map((moment) => moment.id === selectedMoment.id ? { ...moment, subMoments: moment.subMoments.filter((item) => item.id !== submoment.id) } : moment) });
      setNotice("Submoment deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete the submoment.");
    }
  }

  if (loading) return <div className="flex min-h-[65vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Preparing submoments…</div>;
  if (!match || !settings) return <Panel className="border-red-400/20 p-5 text-red-100">{notice || "Could not open this match."}</Panel>;

  return <div className="flex min-h-0 w-full flex-col gap-2 xl:h-[calc(100dvh-6.5rem)] xl:overflow-hidden">
    <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => { void loadVideo(event.target.files?.[0]); event.currentTarget.value = ""; }} />

    {notice ? <div role="status" className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-leaf-400/25 bg-pitch-950/95 px-3 py-2 text-xs text-emerald-100 shadow-2xl"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={13} /></button></div> : null}

    <Panel className="flex shrink-0 flex-wrap items-center gap-2 px-2 py-1.5"><Link href={usingLiveRecording ? `/live/${matchId}` : `/analysis/${matchId}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[.04] px-2.5 text-[10px] font-semibold text-slate-300 transition hover:bg-white/[.08] hover:text-white"><ArrowLeft size={12} />{usingLiveRecording ? "Live tagging" : "Moment tagging"}</Link><span className="hidden min-w-0 max-w-48 truncate text-[10px] font-semibold text-white lg:block">{match.title}</span>{usingLiveRecording ? <Badge className="shrink-0 border-cyan-300/25 bg-cyan-300/10 text-cyan-100">Recorded live video</Badge> : null}<label className="flex min-w-0 flex-1 items-center gap-2"><span className="shrink-0 text-[9px] font-semibold uppercase tracking-[.16em] text-slate-500">Moment</span><Select className="h-8 min-w-0 flex-1 py-0 text-xs" value={filterTypeId} onChange={(event) => changeFilter(event.target.value)}><option value="">All moments ({match.moments.length})</option>{settings.momentTypes.map((type) => <option key={type.id} value={type.id}>{type.name} ({match.moments.filter((moment) => moment.momentTypeId === type.id).length})</option>)}</Select></label><Badge className="shrink-0">{selectedIndex >= 0 ? `${selectedIndex + 1} / ${moments.length}` : `0 / ${moments.length}`}</Badge><Button size="sm" variant="primary" className="h-8 shrink-0" disabled={!hasVideoSource || moments.length === 0} onClick={playAllMoments}><Play size={13} />Play all</Button>{uploading ? <Button size="sm" variant="danger" className="h-8 shrink-0" onClick={() => uploadAbortRef.current?.abort()}><X size={13} />Cancel {Math.round(uploadProgress * 100)}%</Button> : <><Button size="sm" className="h-8 shrink-0" onClick={() => fileInputRef.current?.click()}><Upload size={13} />Upload new</Button><Button size="sm" className="h-8 shrink-0" onClick={() => void openCloudLibrary()}><Cloud size={13} />Cloud library</Button></>}</Panel>

    <div className="submoment-layout grid min-h-0 flex-1 items-stretch gap-2 min-[900px]:grid-cols-[12rem_minmax(0,1fr)_20rem] min-[1400px]:grid-cols-[15rem_minmax(0,1fr)_22rem]">
      <Panel className="flex min-h-0 w-full flex-col overflow-hidden"><div className="shrink-0 border-b border-white/10 px-2.5 py-2"><Label>Tagged moments</Label><span className="ml-2 text-[9px] text-slate-600">{moments.length}</span></div><div className="min-h-0 flex-1 overflow-y-auto">{moments.length === 0 ? <p className="p-4 text-xs text-slate-500">There are no moments in this filter.</p> : moments.map((moment, index) => <button key={moment.id} onClick={() => selectMoment(moment)} className={`flex w-full items-center gap-1.5 border-b border-white/[.06] px-2 py-1.5 text-left transition hover:bg-white/[.06] ${selectedMoment?.id === moment.id ? "bg-leaf-400/10" : ""}`}><span className="w-4 shrink-0 text-right font-mono text-[8px] text-slate-600">{index + 1}</span><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: moment.momentType.color }} /><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-white">{moment.momentType.name}</span><span className="block font-mono text-[8px] text-slate-500">{formatTime(moment.startTimeSeconds)}–{formatTime(moment.endTimeSeconds)}</span></span><Badge className="px-1 py-0 text-[8px]">{moment.subMoments.length}</Badge></button>)}</div></Panel>

      <div className="flex min-h-0 min-w-0 flex-col">
        <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden"><div className="relative aspect-video min-h-72 shrink-0 bg-black xl:aspect-auto xl:min-h-0 xl:flex-1">{videoSourceUrl ? <video key={usingLiveRecording ? selectedLiveSegment?.id : "match-video"} ref={videoRef} src={videoSourceUrl} crossOrigin="anonymous" className="h-full w-full object-contain" playsInline onLoadedMetadata={(event) => { event.currentTarget.playbackRate = playbackRate; }} onTimeUpdate={handleTimeUpdate} onEnded={handleVideoEnded} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} /> : <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-full min-h-72 w-full flex-col items-center justify-center p-6 text-center"><FileVideo size={38} className="text-leaf-400" /><h2 className="mt-3 text-sm font-bold text-white">{restoringVideo ? "Loading the match video…" : "Upload the match video"}</h2><p className="mt-1 max-w-md text-xs text-slate-500">The video will be stored privately in Cloudflare R2.</p>{match.video ? <p className="mt-3 rounded-md border border-white/10 bg-white/[.04] px-3 py-2 text-[10px] text-slate-400">Expected: {match.video.fileName} · {formatBytes(match.video.fileSize)}</p> : null}</button>}{uploading ? <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10"><div className="h-full bg-cyan-300 transition-[width]" style={{ width: `${Math.round(uploadProgress * 100)}%` }} /></div> : null}</div><div className="flex shrink-0 items-center justify-between gap-2 overflow-x-auto border-t border-white/10 p-2"><div className="flex min-w-max gap-1"><Button size="icon" className="h-8 w-8" disabled={selectedIndex <= 0} onClick={() => selectMoment(moments[selectedIndex - 1])}><ChevronLeft size={15} /></Button><Button size="icon" className="h-8 w-8" variant="primary" disabled={!hasVideoSource || !selectedMoment} onClick={togglePlayback}>{playing ? <Pause size={15} /> : <Play size={15} />}</Button><Button size="icon" className="h-8 w-8" disabled={selectedIndex < 0 || selectedIndex >= moments.length - 1} onClick={() => selectMoment(moments[selectedIndex + 1])}><ChevronRight size={15} /></Button><div className="flex overflow-hidden rounded-md border border-white/10">{[.5, 1, 2, 4].map((rate) => <button key={rate} type="button" onClick={() => setRate(rate)} className={`h-8 px-2 text-[10px] font-semibold transition ${playbackRate === rate ? "bg-leaf-400 text-ink-950" : "bg-white/[.04] text-slate-300 hover:bg-white/[.1]"}`}>{rate}×</button>)}</div></div><span className="shrink-0 font-mono text-xs text-white">{formatTime(currentTime)} {selectedMoment ? <span className="text-slate-600">/ {formatTime(selectedMoment.endTimeSeconds)}</span> : null}</span></div></Panel>
      </div>

      <Panel className="flex min-h-0 flex-col overflow-hidden p-2"><div className="flex shrink-0 items-center justify-between"><div className="min-w-0"><Label>Identify submoment</Label><p className="truncate text-[9px] text-slate-500">{selectedMoment ? `${selectedMoment.momentType.name} · ${formatTime(currentTime)} · ${matchPeriodLabel(selectedPeriod)}` : "Select a moment"}</p></div><Crosshair className="shrink-0 text-leaf-400" size={15} /></div><div className="mt-1.5 grid shrink-0 grid-cols-2 gap-1">{availableSubmomentTypes.map((type) => <button key={type.id} type="button" onClick={() => chooseSubMomentType(type.id)} className={`h-7 truncate rounded border px-1.5 text-left text-[9px] font-semibold transition ${selectedSubMomentTypeId === type.id ? "text-white shadow-lg" : "border-white/10 bg-white/[.04] text-slate-400 hover:bg-white/[.08]"}`} style={selectedSubMomentTypeId === type.id ? { backgroundColor: `${type.color}35`, borderColor: type.color } : undefined}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: type.color }} />{type.name}</button>)}</div>{selectedMoment && availableSubmomentTypes.length === 0 ? <p className="mt-2 shrink-0 rounded border border-amber-300/20 bg-amber-400/10 px-2 py-1.5 text-[9px] text-amber-100">This moment has no associated submoments. Configure them in Settings.</p> : null}

        {selectedMoment && selectedSubMomentType ? <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-white/10 pt-2"><div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">{editingSubmomentId ? <div className="flex items-center justify-between rounded border border-leaf-400/25 bg-leaf-400/10 px-2 py-1 text-[9px] text-emerald-100"><span>Editing saved submoment</span><Button size="sm" className="h-6 text-[9px]" onClick={cancelSubmomentEdit}><X size={10} />Cancel</Button></div> : null}{selectedSubMomentType.requiresFieldLocation ? <div><div className="mb-1 flex items-center justify-between"><Label className="text-[9px]">Occurrence location</Label><span className="inline-flex items-center gap-1 text-[8px] text-slate-500"><MapPin size={10} />{fieldMarkers.length} saved</span></div><PitchSurface points={fieldMarkers} value={fieldPoint} color={selectedSubMomentType.color} onChange={setFieldPoint} /></div> : null}{selectedSubMomentType.requiresGoalLocation ? <div><div className="mb-1 flex items-center justify-between"><Label className="text-[9px]">Goal location</Label><Goal size={11} className="text-slate-500" /></div><GoalSurface points={goalMarkers} value={goalPoint} color={selectedSubMomentType.color} onChange={setGoalPoint} /></div> : null}<label className="grid gap-1"><Label className="text-[9px]">Body part</Label><Select className="h-7 py-0 text-[10px]" value={foot} onChange={(event) => setFoot(event.target.value)}><option value="">Not specified</option><option value="right">Right foot</option><option value="left">Left foot</option><option value="head">Head</option><option value="other">Other</option></Select></label><label className="grid gap-1"><Label className="text-[9px]">Notes</Label><TextArea className="h-10 min-h-10 resize-none text-[10px]" value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div><Button className="mt-1.5 h-8 w-full shrink-0 text-[10px]" variant="primary" disabled={saving} onClick={() => void saveSubmoment()}><Save size={12} />{editingSubmomentId ? "Update" : "Save"} {selectedSubMomentType.name}</Button><div className="mt-1.5 max-h-24 shrink-0 overflow-y-auto border-t border-white/10 pt-1.5"><div className="mb-1 flex items-center justify-between"><Label className="text-[9px]">Saved submoments</Label><Badge className="px-1.5 py-0.5 text-[8px]">{selectedMoment.subMoments.length}</Badge></div>{selectedMoment.subMoments.length === 0 ? <p className="text-[9px] text-slate-500">There are no submoments yet.</p> : selectedMoment.subMoments.map((submoment) => <div key={submoment.id} className="flex items-center gap-1.5 border-t border-white/[.06] py-1"><button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => { if (submoment.timeSeconds !== null) void seekToTime(submoment.timeSeconds, false); }}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: submoment.subMomentType.color }} /><span className="min-w-0 flex-1 truncate text-[9px] text-slate-300">{submoment.subMomentType.name} · {formatTime(submoment.timeSeconds || 0)}</span></button><Button size="icon" className="h-6 w-6" onClick={() => editSubmoment(submoment)}><Pencil size={10} /></Button><Button size="icon" variant="danger" className="h-6 w-6" onClick={() => void removeSubmoment(submoment)}><Trash2 size={10} /></Button></div>)}</div></div> : <div className="mt-2 flex min-h-0 flex-1 items-center justify-center rounded border border-dashed border-white/10 p-4 text-center text-[10px] text-slate-500">Select a moment to begin.</div>}
      </Panel>
    </div>
    {showCloudLibrary ? <CloudVideoLibrary assets={cloudAssets} loading={loadingCloudLibrary} error={cloudLibraryError} attachingAssetId={attachingAssetId} onRetry={() => void openCloudLibrary()} onClose={() => !attachingAssetId && setShowCloudLibrary(false)} onSelect={(asset) => void attachSelectedCloudVideo(asset)} /> : null}
  </div>;
}
