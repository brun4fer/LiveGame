"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, CheckSquare, ChevronsRight, FileVideo, Loader2, Pause, Pencil, Play, RotateCcw, Square, Trash2, Upload, X } from "lucide-react";
import { MomentEditDialog } from "@/components/moment-edit-dialog";
import { Badge, Button, Label, Panel, Select } from "@/components/ui";
import { useVideoKeyboardSeek, VideoFullscreenButton } from "@/components/video-controls";
import type { AccountPayload, MatchDetail, MatchSummary, MomentRecord, SettingsPayload } from "@/lib/domain";
import { isExportPickerCancellation, pickExportDirectory, writeBlobToDirectory } from "@/lib/export-directory";
import { apiFetch } from "@/lib/http";
import { getRememberedMatchVideo, rememberMatchVideo } from "@/lib/local-video-store";
import { getRemoteVideoUrl } from "@/lib/remote-video-store";
import { SmartVideoExportSession } from "@/lib/smart-video-export";
import { formatTime } from "@/lib/time";
import { downloadBlob, exportQualityOptions, type ExportQuality } from "@/lib/video-export";

type Clip = { match: MatchDetail; moment: MomentRecord };

export function ReportsClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const files = useRef(new Map<string, File>());
  const autoPlayRef = useRef(false);
  const playlistActiveRef = useRef(false);
  const advancingRef = useRef(false);
  const playRequestRef = useRef(0);
  const remoteUrlsRef = useRef(new Map<string, string>());
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [details, setDetails] = useState<MatchDetail[]>([]);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [momentTypeId, setMomentTypeId] = useState("");
  const [submomentTypeId, setSubmomentTypeId] = useState("");
  const [quality, setQuality] = useState<ExportQuality>("high");
  const [exportClipIds, setExportClipIds] = useState<string[]>([]);
  const [playing, setPlaying] = useState<{ clip: Clip; url: string } | null>(null);
  const [editingClip, setEditingClip] = useState<Clip | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("Team");

  useEffect(() => { Promise.all([apiFetch<MatchSummary[]>("/api/matches"), apiFetch<SettingsPayload>("/api/settings"), apiFetch<AccountPayload>("/api/account")]).then(([rows, config, account]) => { setMatches(rows); setSettings(config); setTeamName(account.teamName || "Team"); }).catch((error: Error) => setNotice(error.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => { let cancelled = false; if (!selectedIds.length) { setDetails([]); return; } setLoadingDetails(true); Promise.all(selectedIds.map((id) => apiFetch<MatchDetail>(`/api/matches/${id}`))).then((rows) => { if (!cancelled) setDetails(rows); }).catch((error: Error) => setNotice(error.message)).finally(() => { if (!cancelled) setLoadingDetails(false); }); return () => { cancelled = true; }; }, [selectedIds]);
  useEffect(() => () => { playRequestRef.current += 1; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  const clips = useMemo<Clip[]>(() => details.flatMap((match) => match.moments.filter((moment) => !momentTypeId || moment.momentTypeId === momentTypeId).filter((moment) => !submomentTypeId || moment.subMoments.some((sub) => sub.subMomentTypeId === submomentTypeId)).map((moment) => ({ match, moment }))), [details, momentTypeId, submomentTypeId]);
  const availableSubmomentTypes = useMemo(() => {
    if (!settings || !momentTypeId) return settings?.subMomentTypes || [];
    const allowedIds = new Set(settings.momentTypes.find((type) => type.id === momentTypeId)?.allowedSubmoments?.map((type) => type.id) || []);
    return settings.subMomentTypes.filter((type) => allowedIds.has(type.id));
  }, [momentTypeId, settings]);
  const totalDuration = clips.reduce((sum, clip) => sum + clip.moment.durationSeconds, 0);
  const totalSubmoments = clips.reduce((sum, clip) => sum + clip.moment.subMoments.length, 0);
  const selectedExportClips = useMemo(() => clips.filter((clip) => exportClipIds.includes(clip.moment.id)), [clips, exportClipIds]);

  useEffect(() => { setExportClipIds((current) => current.filter((id) => clips.some((clip) => clip.moment.id === id))); }, [clips]);

  useEffect(() => {
    if (!playing || clips.some((clip) => clip.moment.id === playing.clip.moment.id)) return;
    playlistActiveRef.current = false;
    advancingRef.current = false;
    playRequestRef.current += 1;
    videoRef.current?.pause();
    setPlaying(null);
  }, [clips, playing]);

  function toggleMatch(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function toggleExportClip(id: string) { setExportClipIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  async function getVideo(match: MatchDetail) { const file = files.current.get(match.id) || await getRememberedMatchVideo(match.id).catch(() => null); if (file) files.current.set(match.id, file); return file; }

  async function getExportSource(match: MatchDetail) {
    const file = await getVideo(match);
    if (file) {
      const url = URL.createObjectURL(file);
      return { source: file as File | string, url, release: () => URL.revokeObjectURL(url) };
    }
    if (match.video?.storageStatus !== "READY") return null;
    const remote = await getRemoteVideoUrl(match.id).catch(() => null);
    return remote ? { source: remote.url as File | string, url: remote.url, release: () => undefined } : null;
  }

  async function addVideos(list: FileList | null) {
    if (!list) return;
    const unmatched: string[] = [];
    for (const file of Array.from(list)) {
      const match = matches.find((item) => item.video?.fileName.toLowerCase() === file.name.toLowerCase());
      if (!match) { unmatched.push(file.name); continue; }
      files.current.set(match.id, file); await rememberMatchVideo(match.id, file).catch(() => undefined);
    }
    setNotice(unmatched.length ? `Could not match: ${unmatched.join(", ")}.` : "Local videos are ready.");
  }

  async function playClip(clip: Clip, fromPlaylist = false) {
    autoPlayRef.current = true;
    playlistActiveRef.current = fromPlaylist;
    if (!fromPlaylist) advancingRef.current = false;
    if (playing?.clip.moment.id === clip.moment.id && videoRef.current) {
      videoRef.current.currentTime = clip.moment.startTimeSeconds;
      await videoRef.current.play();
      return;
    }
    const request = ++playRequestRef.current;
    if (clip.match.video?.storageStatus === "READY") {
      const cachedUrl = remoteUrlsRef.current.get(clip.match.id);
      const remote = cachedUrl ? { url: cachedUrl } : await getRemoteVideoUrl(clip.match.id).catch(() => null);
      if (request !== playRequestRef.current) return;
      if (remote) {
        remoteUrlsRef.current.set(clip.match.id, remote.url);
        if (objectUrl.current) {
          URL.revokeObjectURL(objectUrl.current);
          objectUrl.current = null;
        }
        setPlaying({ clip, url: remote.url });
        setNotice(null);
        return;
      }
    }
    const file = await getVideo(clip.match);
    if (request !== playRequestRef.current) return;
    if (!file) {
      playlistActiveRef.current = false;
      setNotice(clip.match.video?.storageStatus === "READY" ? `The cloud video for “${clip.match.title}” could not be loaded.` : `Upload the video for “${clip.match.title}” from its analysis page.`);
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file); setPlaying({ clip, url: objectUrl.current }); setNotice(null);
  }

  function playAll() {
    if (!clips.length) return;
    autoPlayRef.current = true;
    playlistActiveRef.current = true;
    advancingRef.current = false;
    void playClip(clips[0], true);
  }

  function finishClip(video: HTMLVideoElement) {
    if (!playing || advancingRef.current || video.currentTime < playing.clip.moment.endTimeSeconds - .04) return;
    advancingRef.current = true;
    video.pause();
    video.currentTime = playing.clip.moment.endTimeSeconds;
    const selectedIndex = clips.findIndex((clip) => clip.moment.id === playing.clip.moment.id);
    if (playlistActiveRef.current && selectedIndex >= 0 && selectedIndex < clips.length - 1) {
      void playClip(clips[selectedIndex + 1], true).finally(() => { advancingRef.current = false; });
    } else {
      playlistActiveRef.current = false;
      advancingRef.current = false;
    }
  }

  function toggleClipPlayback() {
    const video = videoRef.current;
    if (!video || !playing) return;
    if (!video.paused) {
      autoPlayRef.current = false;
      playlistActiveRef.current = false;
      video.pause();
      return;
    }
    autoPlayRef.current = true;
    if (video.currentTime < playing.clip.moment.startTimeSeconds || video.currentTime >= playing.clip.moment.endTimeSeconds) {
      video.currentTime = playing.clip.moment.startTimeSeconds;
    }
    void video.play();
  }

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (!video || !playing) return;
    const start = playing.clip.moment.startTimeSeconds;
    const end = Math.min(video.duration || playing.clip.moment.endTimeSeconds, playing.clip.moment.endTimeSeconds);
    const next = Math.max(start, Math.min(end, seconds));
    video.currentTime = next;
    setCurrentTime(next);
  }

  function setReportRate(rate: number) {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }

  useVideoKeyboardSeek(videoRef, seekTo, Boolean(playing));

  async function updateReportMoment(clip: Clip, input: { momentTypeId: string; startTimeSeconds: number; endTimeSeconds: number; notes: string | null }) {
    const saved = await apiFetch<MomentRecord>(`/api/moments/${clip.moment.id}`, { method: "PATCH", body: JSON.stringify(input) });
    setDetails((current) => current.map((match) => match.id === clip.match.id ? { ...match, moments: match.moments.map((moment) => moment.id === saved.id ? saved : moment) } : match));
    setPlaying((current) => current?.clip.moment.id === saved.id ? { ...current, clip: { ...current.clip, moment: saved } } : current);
    setEditingClip(null);
    setNotice("Clip updated successfully.");
  }

  async function removeReportMoment(clip: Clip) {
    if (!confirm(`Delete ${clip.moment.momentType.name} from ${clip.match.title}?`)) return;
    try {
      await apiFetch(`/api/moments/${clip.moment.id}`, { method: "DELETE" });
      setDetails((current) => current.map((match) => match.id === clip.match.id ? { ...match, moments: match.moments.filter((moment) => moment.id !== clip.moment.id), momentCount: Math.max(0, match.momentCount - 1) } : match));
      setMatches((current) => current.map((match) => match.id === clip.match.id ? { ...match, momentCount: Math.max(0, match.momentCount - 1) } : match));
      setExportClipIds((current) => current.filter((id) => id !== clip.moment.id));
      setEditingClip((current) => current?.moment.id === clip.moment.id ? null : current);
      if (playing?.clip.moment.id === clip.moment.id) {
        playRequestRef.current += 1;
        autoPlayRef.current = false;
        playlistActiveRef.current = false;
        advancingRef.current = false;
        videoRef.current?.pause();
        setPlaying(null);
        setIsPlaying(false);
        if (objectUrl.current) {
          URL.revokeObjectURL(objectUrl.current);
          objectUrl.current = null;
        }
      }
      setNotice("Clip deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete the clip.");
    }
  }

  async function exportClips() {
    if (!selectedExportClips.length) return;
    const clipsToExport = selectedExportClips;
    let directory = null;
    try { directory = await pickExportDirectory(); } catch (error) { if (isExportPickerCancellation(error)) return; return setNotice(error instanceof Error ? error.message : "Could not open the export folder."); }
    setExporting(true); setNotice(null);
    const selectedMatchCount = new Set(clipsToExport.map((clip) => clip.match.id)).size;
    const root = `${safeName(teamName)}-report-${selectedMatchCount}-matches-${clipsToExport.length}-clips`;
    const archive = directory ? null : new (await import("jszip")).default();
    const indexRows = [["match", "moment", "start", "end", "submoments", "files"]];
    let completed = 0;
    try {
      const groups = new Map<string, Clip[]>(); for (const clip of clipsToExport) groups.set(clip.match.id, [...(groups.get(clip.match.id) || []), clip]);
      for (const group of groups.values()) {
        const match = group[0].match;
        const exportVideo = await getExportSource(match);
        if (!exportVideo) throw new Error(`The cloud video for “${match.title}” is not available. Load the local file to continue.`);
        const session = new SmartVideoExportSession(exportVideo.source);
        try {
          for (const clip of group) {
            completed += 1; setStatus(`Exporting ${completed} of ${clipsToExport.length}: ${clip.match.title}`);
            const result = await session.exportMoment({ match: clip.match, moment: clip.moment, quality, sourceUrlFallback: exportVideo.url, onStatus: (message) => setStatus(`${completed} of ${clipsToExport.length}: ${message}`) });
            const folders = [...new Set(clip.moment.subMoments.map((item) => item.subMomentType.name))]; if (!folders.length) folders.push("No submoment");
            const fileName = `${String(completed).padStart(3, "0")}-${result.fileName}`; const paths = folders.map((folder) => `${safeName(clip.moment.momentType.name)}/${safeName(folder)}/${fileName}`);
            for (const path of paths) { if (directory) await writeBlobToDirectory(directory, `${root}/${path}`, result.blob); else archive?.file(`${root}/${path}`, result.blob); }
            indexRows.push([clip.match.title, clip.moment.momentType.name, String(clip.moment.startTimeSeconds), String(clip.moment.endTimeSeconds), folders.join(" | "), paths.join(" | ")]);
          }
        } finally { session.dispose(); exportVideo.release(); }
      }
      const csv = new Blob([toCsv(indexRows)], { type: "text/csv;charset=utf-8" });
      if (directory) await writeBlobToDirectory(directory, `${root}/report-index.csv`, csv);
      else {
        archive?.file(`${root}/report-index.csv`, csv);
        setStatus("Creating the ZIP file…");
        const blob = await archive!.generateAsync({ type: "blob", compression: "STORE", streamFiles: true }, (metadata) => setStatus(`Creating the ZIP file: ${Math.round(metadata.percent)}%`));
        downloadBlob(blob, `${root}.zip`);
      }
      setNotice(`${completed} clips exported successfully${directory ? ` to ${root}` : " in a ZIP file"}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not export the clips."); } finally { setExporting(false); setStatus(""); }
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Loading reports…</div>;
  return <div className="space-y-3">
    {notice ? <div className="flex justify-between rounded-xl border border-leaf-400/25 bg-leaf-400/10 p-3 text-sm text-emerald-100"><span>{notice}</span><button onClick={() => setNotice(null)}><X size={16} /></button></div> : null}{exporting ? <div className="flex items-center gap-3 rounded-xl border border-leaf-400/25 bg-leaf-400/10 p-3 text-sm text-emerald-100"><Loader2 className="animate-spin" size={17} />{status}</div> : null}
    <Panel className="grid gap-3 p-3 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_auto]"><label className="grid gap-1"><Label>Moment</Label><Select value={momentTypeId} onChange={(event) => { setMomentTypeId(event.target.value); setSubmomentTypeId(""); }}><option value="">All moments</option>{settings?.momentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></label><label className="grid gap-1"><Label>Submoment</Label><Select value={submomentTypeId} onChange={(event) => setSubmomentTypeId(event.target.value)}><option value="">All submoments</option>{availableSubmomentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></label><label className="grid gap-1"><Label>Export quality</Label><Select value={quality} onChange={(event) => setQuality(event.target.value as ExportQuality)}>{exportQualityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></label><div className="flex flex-wrap items-end gap-2 md:col-span-3 xl:col-span-1"><Metric label="Clips" value={clips.length} /><Metric label="Duration" value={formatTime(totalDuration)} /><Metric label="Submoments" value={totalSubmoments} /></div></Panel>
    <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]"><Panel className="overflow-hidden"><div className="flex gap-2 border-b border-white/10 p-3"><Button size="sm" onClick={() => setSelectedIds(matches.map((item) => item.id))}><CheckSquare size={14} />Select all</Button><Button size="sm" onClick={() => setSelectedIds([])}>Clear</Button></div><div className="max-h-[42rem] overflow-y-auto">{matches.map((match) => <button key={match.id} onClick={() => toggleMatch(match.id)} className={`flex w-full items-start gap-3 border-b border-white/[.06] p-3 text-left hover:bg-white/[.06] ${selectedIds.includes(match.id) ? "bg-leaf-400/10" : ""}`}>{selectedIds.includes(match.id) ? <CheckSquare size={17} className="text-leaf-400" /> : <Square size={17} className="text-slate-600" />}<span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{match.title}</span><span className="text-xs text-slate-500">{match.momentCount} moments · {match.video?.fileName || "No video"}</span></span></button>)}</div></Panel>
      <div className="space-y-4"><Panel className="flex flex-wrap items-center justify-between gap-3 p-3"><div><p className="font-semibold text-white">{loadingDetails ? "Loading clips…" : `${clips.length} clips found`}</p><p className="text-xs text-slate-500"><strong className="text-cyan-200">{selectedExportClips.length}</strong> selected for export. Play all always uses every filtered clip.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" disabled={!clips.length} onClick={() => setExportClipIds(clips.map((clip) => clip.moment.id))}><CheckSquare size={14}/>Select all</Button><Button size="sm" disabled={!exportClipIds.length} onClick={() => setExportClipIds([])}>Clear selection</Button><Button variant="primary" disabled={!clips.length || loadingDetails} onClick={playAll}><Play size={16} />Play all</Button><label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[.06] px-3 text-xs font-semibold text-slate-100 hover:bg-white/[.11]"><Upload size={14} />Load local fallback<input type="file" accept="video/*" multiple className="hidden" onChange={(event) => void addVideos(event.target.files)} /></label><Button disabled={!selectedExportClips.length || exporting} onClick={() => void exportClips()}><Archive size={16} />Export selected ({selectedExportClips.length})</Button></div></Panel>
      <div ref={workspaceRef} data-video-workspace className={`reports-video-workspace grid gap-4 ${playing ? "lg:h-[min(62vh,42rem)] lg:min-h-[30rem] lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
        {playing ? <Panel className="reports-video-panel flex min-h-0 flex-col overflow-hidden">
          <div className="reports-video-stage aspect-video bg-black xl:min-h-0 xl:flex-1 xl:aspect-auto"><video key={`${playing.url}-${playing.clip.moment.id}`} ref={videoRef} src={playing.url} crossOrigin="anonymous" className="h-full w-full object-contain" playsInline onLoadedMetadata={(event) => { setVideoDuration(event.currentTarget.duration); setCurrentTime(playing.clip.moment.startTimeSeconds); event.currentTarget.currentTime = playing.clip.moment.startTimeSeconds; event.currentTarget.playbackRate = playbackRate; if (autoPlayRef.current) void event.currentTarget.play(); }} onTimeUpdate={(event) => { setCurrentTime(event.currentTarget.currentTime); finishClip(event.currentTarget); }} onPlay={() => { autoPlayRef.current = true; setIsPlaying(true); }} onPause={() => setIsPlaying(false)} /></div>
          <div className="border-t border-white/10 p-3"><input aria-label="Clip position" type="range" min={playing.clip.moment.startTimeSeconds} max={Math.min(videoDuration || playing.clip.moment.endTimeSeconds, playing.clip.moment.endTimeSeconds)} step={.1} value={Math.max(playing.clip.moment.startTimeSeconds, Math.min(currentTime, playing.clip.moment.endTimeSeconds))} onChange={(event) => seekTo(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-cyan-300"/><div className="mt-2 flex flex-wrap items-center gap-1"><span className="mr-auto font-mono text-xs text-slate-300">{formatTime(currentTime)} / {formatTime(playing.clip.moment.endTimeSeconds)}</span><Button size="icon" className="h-8 w-8" title="Back 5 seconds (left arrow)" aria-label="Back 5 seconds" onClick={() => seekTo(currentTime - 5)}><RotateCcw size={14}/></Button><Button size="icon" className="h-8 w-8" variant="primary" title={isPlaying ? "Pause" : "Play"} aria-label={isPlaying ? "Pause" : "Play"} onClick={toggleClipPlayback}>{isPlaying ? <Pause size={14}/> : <Play size={14}/>}</Button><Button size="icon" className="h-8 w-8" title="Forward 5 seconds (right arrow)" aria-label="Forward 5 seconds" onClick={() => seekTo(currentTime + 5)}><ChevronsRight size={14}/></Button><div className="flex h-8 overflow-hidden rounded-md border border-white/10">{[1, 2, 4].map((rate) => <button key={rate} type="button" title={`${rate}x speed`} aria-label={`${rate}x speed`} onClick={() => setReportRate(rate)} className={`min-w-9 px-2 text-[10px] font-semibold transition ${playbackRate === rate ? "bg-cyan-300 text-slate-950" : "bg-white/[.04] text-slate-300 hover:bg-white/[.1]"}`}>{rate}x</button>)}</div><VideoFullscreenButton targetRef={workspaceRef}/></div></div>
          <div className="border-t border-white/10 px-3 py-2"><p className="truncate text-xs font-semibold text-white">{playing.clip.match.title} <span className="font-normal text-slate-500">· {playing.clip.moment.momentType.name} · {formatTime(playing.clip.moment.startTimeSeconds)}–{formatTime(playing.clip.moment.endTimeSeconds)}</span></p></div>
        </Panel> : null}
        <Panel className={`reports-clip-list overflow-hidden ${playing ? "lg:flex lg:min-h-0 lg:flex-col" : ""}`}>
          <div className="flex items-center justify-between border-b border-white/[.08] px-3 py-2"><div><Label>Clips</Label><p className="mt-1 text-[10px] text-slate-500">Checkboxes only control export. Click the time to play.</p></div><Badge>{selectedExportClips.length}/{clips.length}</Badge></div>
          <div className={`${playing ? "lg:min-h-0 lg:flex-1 lg:overflow-y-auto" : ""} divide-y divide-white/[.06]`}>
            {clips.length ? clips.map((clip, index) => <div key={clip.moment.id} className={`flex h-9 w-full items-center gap-1 border-b border-white/[.04] px-2 hover:bg-white/[.05] ${playing?.clip.moment.id === clip.moment.id ? "bg-leaf-400/10" : ""}`}><input type="checkbox" checked={exportClipIds.includes(clip.moment.id)} onChange={() => toggleExportClip(clip.moment.id)} aria-label={`Select clip ${index + 1} for export`} className="h-3.5 w-3.5 shrink-0 accent-cyan-300"/><button type="button" onClick={() => void playClip(clip)} title={`${clip.match.title} · ${clip.moment.momentType.name}`} className="flex min-w-0 flex-1 items-center gap-1.5 text-left"><span className="w-6 shrink-0 text-right font-mono text-[9px] text-slate-500">#{index + 1}</span><Play size={11} className="shrink-0 text-leaf-400"/><span className="min-w-0 flex-1 truncate font-mono text-[9px] text-slate-300">{formatTime(clip.moment.startTimeSeconds)}–{formatTime(clip.moment.endTimeSeconds)}</span><Badge className="shrink-0 px-1 py-0 text-[8px]">{clip.moment.subMoments.length} sub.</Badge>{clip.moment.outcome === "positive" ? <span title="Positive" aria-label="Positive" className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-400/15 text-emerald-300"><Check size={11}/></span> : clip.moment.outcome === "negative" ? <span title="Negative" aria-label="Negative" className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-red-400/15 text-red-300"><X size={11}/></span> : <span title="No result" aria-label="No result" className="w-5 shrink-0 text-center text-[10px] text-slate-600">—</span>}</button><Button size="icon" className="h-6 w-6 shrink-0" title="Edit clip" aria-label="Edit clip" onClick={() => setEditingClip(clip)}><Pencil size={11} /></Button><Button size="icon" variant="danger" className="h-6 w-6 shrink-0" title="Delete clip" aria-label="Delete clip" onClick={() => void removeReportMoment(clip)}><Trash2 size={11} /></Button></div>) : <div className="p-10 text-center text-sm text-slate-500"><FileVideo className="mx-auto mb-3" />Select at least one match.</div>}
          </div>
        </Panel>
      </div></div></div>
    {editingClip && settings ? <MomentEditDialog moment={editingClip.moment} momentTypes={settings.momentTypes} duration={editingClip.match.video?.durationSeconds || 0} onSave={(input) => updateReportMoment(editingClip, input)} onClose={() => setEditingClip(null)} /> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="min-w-20 rounded-md border border-white/10 bg-white/[.04] px-2.5 py-1.5"><p className="text-sm font-bold text-white">{value}</p><p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p></div>; }
function safeName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim() || "Unnamed"; }
function toCsv(rows: string[][]) { return `\uFEFF${rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\r\n")}`; }

