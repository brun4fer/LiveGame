"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, Check, ChevronsLeft, ChevronsRight, Clock3, Cloud, Download, FileVideo, Loader2, Pause, Pencil, Play, RotateCcw, Settings2, Trash2, Upload, X } from "lucide-react";

import { CloudVideoLibrary } from "@/components/cloud-video-library";
import { MatchEditDialog } from "@/components/match-edit-dialog";
import { MomentEditDialog } from "@/components/moment-edit-dialog";
import { Badge, Button, Panel } from "@/components/ui";
import type { AccountPayload, MatchDetail, MomentRecord, MomentTypeRecord, SettingsPayload } from "@/lib/domain";
import { isExportPickerCancellation, pickExportDirectory, writeBlobToDirectory } from "@/lib/export-directory";
import { isFilePickerCancellation, saveFullVideo } from "@/lib/full-video-download";
import { apiFetch } from "@/lib/http";
import { getRememberedMatchVideo, rememberMatchVideo } from "@/lib/local-video-store";
import { getMatchPeriodAtTime } from "@/lib/match-periods";
import { attachCloudVideo, getCloudVideoLibrary, getRemoteVideoUrl, uploadMatchVideo, type CloudVideoAsset } from "@/lib/remote-video-store";
import { SmartVideoExportSession } from "@/lib/smart-video-export";
import { formatBytes, formatTime, roundTime } from "@/lib/time";
import { downloadBlob } from "@/lib/video-export";

type ActiveMoment = { id: string; momentTypeId: string; startTimeSeconds: number };
type PeriodMarkerKey = "firstHalfStartSeconds" | "firstHalfEndSeconds" | "secondHalfStartSeconds" | "secondHalfEndSeconds";

const periodMarkers: Array<[PeriodMarkerKey, string]> = [
  ["firstHalfStartSeconds", "Start 1st half"],
  ["firstHalfEndSeconds", "End 1st half"],
  ["secondHalfStartSeconds", "Start 2nd half"],
  ["secondHalfEndSeconds", "End 2nd half"]
];

const periodStyles = [
  { short: "1H Start", color: "#22d3ee" },
  { short: "1H End", color: "#60a5fa" },
  { short: "2H Start", color: "#34d399" },
  { short: "2H End", color: "#a78bfa" }
];

export function AnalysisWorkspace({ matchId }: { matchId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sourceFileRef = useRef<File | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [teamName, setTeamName] = useState("Team");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoringVideo, setRestoringVideo] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [seekTime, setSeekTime] = useState("");
  const [activeMoments, setActiveMoments] = useState<ActiveMoment[]>([]);
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const [editingMoment, setEditingMoment] = useState<MomentRecord | null>(null);
  const [editingMatch, setEditingMatch] = useState(false);
  const [previewEnd, setPreviewEnd] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadingVideo, setDownloadingVideo] = useState(false);
  const [showCloudLibrary, setShowCloudLibrary] = useState(false);
  const [cloudAssets, setCloudAssets] = useState<CloudVideoAsset[]>([]);
  const [loadingCloudLibrary, setLoadingCloudLibrary] = useState(false);
  const [cloudLibraryError, setCloudLibraryError] = useState<string | null>(null);
  const [attachingAssetId, setAttachingAssetId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([apiFetch<MatchDetail>(`/api/matches/${matchId}`), apiFetch<SettingsPayload>("/api/settings"), apiFetch<AccountPayload>("/api/account").catch(() => null)])
      .then(async ([matchData, settingsData, account]) => {
        if (!active) return;
        setMatch(matchData);
        setSettings(settingsData);
        setTeamName(account?.teamName || "Team");
        setSelectedMomentId(matchData.moments[0]?.id || null);
        if (matchData.video?.storageStatus === "READY") {
          const remote = await getRemoteVideoUrl(matchId).catch(() => null);
          if (active && remote) {
            setSourceUrl(remote.url);
            setDuration(matchData.video!.durationSeconds);
            return;
          }
        }
        const file = await getRememberedMatchVideo(matchId).catch(() => null);
        if (active && file) {
          sourceFileRef.current = file;
          setSourceUrl(URL.createObjectURL(file));
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

  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);

  async function loadVideo(file?: File) {
    if (!file) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceFileRef.current = file;
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
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
      setDuration(result.durationSeconds);
      const [remote, savedMatch] = await Promise.all([
        getRemoteVideoUrl(matchId),
        apiFetch<MatchDetail>(`/api/matches/${matchId}`),
      ]);
      setSourceUrl(remote.url);
      setMatch(savedMatch);
      setNotice(result.resumed ? "Video upload resumed and completed successfully." : "Video stored securely in Cloudflare R2.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The video could not be uploaded.");
    } finally {
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
      setUploading(false);
    }
  }

  function cancelUpload() {
    uploadAbortRef.current?.abort();
  }

  async function downloadFullVideo() {
    if (!match?.video || downloadingVideo) return;
    setDownloadingVideo(true);
    try {
      const localFile = sourceFileRef.current;
      await saveFullVideo({
        file: localFile,
        resolveRemoteUrl: !localFile && match.video.storageStatus === "READY" ? async () => (await getRemoteVideoUrl(matchId)).url : undefined,
        fileName: localFile?.name || match.video.fileName,
        mimeType: localFile?.type || match.video.mimeType,
        onProgress: (progress) => setNotice(progress === null ? "Downloading the complete match video…" : `Downloading the complete match video… ${Math.round(progress * 100)}%`),
      });
      setNotice("Complete match video saved successfully.");
    } catch (error) {
      if (!isFilePickerCancellation(error)) setNotice(error instanceof Error ? error.message : "The complete match video could not be downloaded.");
    } finally {
      setDownloadingVideo(false);
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
      sourceFileRef.current = null;
      setSourceUrl(remote.url);
      setDuration(asset.durationSeconds);
      setMatch(savedMatch);
      setShowCloudLibrary(false);
      setNotice(`Using ${asset.fileName} from the shared cloud library.`);
    } catch (error) {
      setCloudLibraryError(error instanceof Error ? error.message : "Could not attach the selected cloud video.");
    } finally {
      setAttachingAssetId(null);
    }
  }

  const createMoment = useCallback(async (type: MomentTypeRecord, startTimeSeconds: number, endTimeSeconds: number) => {
    if (!match || endTimeSeconds <= startTimeSeconds) {
      setNotice("The end of a moment must be after its start.");
      return;
    }
    setSaving(true);
    try {
      const saved = await apiFetch<MomentRecord>(`/api/matches/${match.id}/moments`, {
        method: "POST",
        body: JSON.stringify({ momentTypeId: type.id, startTimeSeconds, endTimeSeconds, period: getMatchPeriodAtTime(match, startTimeSeconds) })
      });
      setMatch((current) => current ? { ...current, momentCount: current.momentCount + 1, moments: [...current.moments, saved].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds) } : current);
      setSelectedMomentId(saved.id);
      setNotice(`${type.name} saved: ${formatTime(startTimeSeconds)} – ${formatTime(endTimeSeconds)}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the moment.");
      setActiveMoments((current) => [...current, { id: `${type.id}-${startTimeSeconds}`, momentTypeId: type.id, startTimeSeconds }]);
    } finally { setSaving(false); }
  }, [match]);

  const toggleMoment = useCallback((type: MomentTypeRecord) => {
    if (!sourceUrl) {
      setNotice("Select the local match video first.");
      fileInputRef.current?.click();
      return;
    }
    const videoTime = roundTime(videoRef.current?.currentTime ?? currentTime);
    const active = activeMoments.find((item) => item.momentTypeId === type.id);
    if (!active) {
      setActiveMoments((current) => [...current, { id: `${type.id}-${Date.now()}`, momentTypeId: type.id, startTimeSeconds: videoTime }]);
      setNotice(`${type.name} started at ${formatTime(videoTime)}. Press ${type.defaultShortcut || "the same key"} again to finish it.`);
      return;
    }
    if (videoTime <= active.startTimeSeconds) {
      setNotice("Move the video forward before finishing this moment.");
      return;
    }
    setActiveMoments((current) => current.filter((item) => item.id !== active.id));
    void createMoment(type, active.startTimeSeconds, videoTime);
  }, [activeMoments, createMoment, currentTime, sourceUrl]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.matches("input, textarea, select")) return;
      if (editingMoment || editingMatch || showCloudLibrary) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const video = videoRef.current;
        if (!video) return;
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? -5 : 5;
        const limit = duration || video.duration || 0;
        const next = Math.max(0, Math.min(limit, video.currentTime + delta));
        setPreviewEnd(null);
        video.currentTime = next;
        setCurrentTime(next);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        const video = videoRef.current;
        if (!video) return;
        setPreviewEnd(null);
        if (video.paused) void video.play(); else video.pause();
        return;
      }
      const type = settings?.momentTypes.find((item) => item.active && item.defaultShortcut?.toLowerCase() === event.key.toLowerCase());
      if (!type) return;
      event.preventDefault();
      toggleMoment(type);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [duration, editingMatch, editingMoment, settings?.momentTypes, showCloudLibrary, toggleMoment]);

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(duration || video.duration || 0, seconds));
    setPreviewEnd(null);
    video.currentTime = next;
    setCurrentTime(next);
  }

  function seekBy(seconds: number) { seekTo((videoRef.current?.currentTime ?? currentTime) + seconds); }

  function goToExactTime() {
    const seconds = Number(seekTime);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > duration) {
      setNotice(`Enter a second between 0 and ${formatTime(duration)}.`);
      return;
    }
    seekTo(seconds);
  }

  function setRate(rate: number) {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    setPreviewEnd(null);
    if (video.paused) void video.play(); else video.pause();
  }

  function reviewMoment(moment: MomentRecord) {
    setSelectedMomentId(moment.id);
    const video = videoRef.current;
    if (!video) return;
    setPreviewEnd(moment.endTimeSeconds);
    video.currentTime = moment.startTimeSeconds;
    void video.play();
  }

  async function updateMoment(moment: MomentRecord, input: Record<string, unknown>) {
    const saved = await apiFetch<MomentRecord>(`/api/moments/${moment.id}`, { method: "PATCH", body: JSON.stringify(input) });
    setMatch((current) => current ? { ...current, moments: current.moments.map((item) => item.id === saved.id ? saved : item).sort((a, b) => a.startTimeSeconds - b.startTimeSeconds) } : current);
    setEditingMoment(null);
    setSelectedMomentId(saved.id);
    setNotice("Moment updated.");
  }

  async function toggleOutcome(moment: MomentRecord, outcome: "positive" | "negative") {
    try { await updateMoment(moment, { outcome: moment.outcome === outcome ? null : outcome }); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not classify the moment."); }
  }

  async function removeMoment(moment: MomentRecord) {
    if (!confirm(`Delete ${moment.momentType.name} and all of its submoments?`)) return;
    try {
      await apiFetch(`/api/moments/${moment.id}`, { method: "DELETE" });
      setMatch((current) => {
        if (!current) return current;
        const moments = current.moments.filter((item) => item.id !== moment.id);
        setSelectedMomentId(moments[0]?.id || null);
        return { ...current, moments, momentCount: Math.max(0, current.momentCount - 1) };
      });
      setNotice("Moment deleted.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not delete the moment."); }
  }

  async function removeLastMoment(moment: MomentRecord | null) {
    if (!moment) return;
    try {
      await apiFetch(`/api/moments/${moment.id}`, { method: "DELETE" });
      setMatch((current) => {
        if (!current) return current;
        const moments = current.moments.filter((item) => item.id !== moment.id);
        setSelectedMomentId((selected) => selected === moment.id ? moments[0]?.id || null : selected);
        return { ...current, moments, momentCount: Math.max(0, current.momentCount - 1) };
      });
      setNotice(`Last recorded moment removed: ${moment.momentType.name} at ${formatTime(moment.startTimeSeconds)}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove the last recorded moment.");
    }
  }

  async function setPeriodMarker(key: PeriodMarkerKey) {
    try {
      const saved = await apiFetch<MatchDetail>(`/api/matches/${matchId}`, { method: "PATCH", body: JSON.stringify({ [key]: roundTime(currentTime) }) });
      setMatch(saved);
      setNotice(`Match period saved at ${formatTime(currentTime)}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save the match period."); }
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

  async function exportAllMoments() {
    if (!match || match.moments.length === 0 || exporting) return;

    const localFile = sourceFileRef.current || await getRememberedMatchVideo(match.id).catch(() => null);
    const remote = !localFile && match.video?.storageStatus === "READY"
      ? await getRemoteVideoUrl(match.id).catch(() => null)
      : null;
    const exportSource: File | string | null = localFile || remote?.url || null;
    if (!exportSource) {
      setNotice("The cloud video is not available. Select the local match video to continue.");
      fileInputRef.current?.click();
      return;
    }

    let directory = null;
    try {
      directory = await pickExportDirectory();
    } catch (error) {
      if (isExportPickerCancellation(error)) return;
      setNotice(error instanceof Error ? error.message : "Could not open the export folder.");
      return;
    }

    setExporting(true);
    setNotice(null);
    setExportStatus("Preparing export…");

    const moments = [...match.moments].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const root = `${safeExportName(match.title)}-${moments.length}-clips`;
    const archive = directory ? null : new (await import("jszip")).default();
    const indexRows = [["moment", "start", "end", "submoments", "files"]];
    const exportUrl = typeof exportSource === "string" ? exportSource : sourceUrl || URL.createObjectURL(exportSource);
    const ownsExportUrl = typeof exportSource !== "string" && !sourceUrl;
    const session = new SmartVideoExportSession(exportSource);

    try {
      for (const [index, moment] of moments.entries()) {
        const current = index + 1;
        setExportStatus(`Exporting ${current} of ${moments.length}: ${moment.momentType.name}`);
        const result = await session.exportMoment({
          match,
          moment,
          quality: "high",
          sourceUrlFallback: exportUrl,
          onStatus: (message) => setExportStatus(`${current} of ${moments.length}: ${message}`)
        });
        const folders = [...new Set(moment.subMoments.map((item) => item.subMomentType.name))];
        if (folders.length === 0) folders.push("No submoment");
        const fileName = `${String(current).padStart(3, "0")}-${result.fileName}`;
        const paths = folders.map((folder) => `${safeExportName(moment.momentType.name)}/${safeExportName(folder)}/${fileName}`);

        for (const path of paths) {
          if (directory) await writeBlobToDirectory(directory, `${root}/${path}`, result.blob);
          else archive?.file(`${root}/${path}`, result.blob);
        }

        indexRows.push([
          moment.momentType.name,
          formatTime(moment.startTimeSeconds),
          formatTime(moment.endTimeSeconds),
          folders.join(" | "),
          paths.join(" | ")
        ]);
      }

      const csv = new Blob([toCsv(indexRows)], { type: "text/csv;charset=utf-8" });
      if (directory) {
        await writeBlobToDirectory(directory, `${root}/index.csv`, csv);
      } else {
        archive?.file(`${root}/index.csv`, csv);
        setExportStatus("Creating the ZIP file…");
        const blob = await archive!.generateAsync(
          { type: "blob", compression: "STORE", streamFiles: true },
          (metadata) => setExportStatus(`Creating the ZIP file: ${Math.round(metadata.percent)}%`)
        );
        downloadBlob(blob, `${root}.zip`);
      }

      setNotice(`${moments.length} moments exported successfully${directory ? ` to ${root}` : " in a ZIP file"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not export all moments.");
    } finally {
      session.dispose();
      if (ownsExportUrl) URL.revokeObjectURL(exportUrl);
      setExporting(false);
      setExportStatus("");
    }
  }

  if (loading) return <div className="flex min-h-[65vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Preparing analysis…</div>;
  if (!match || !settings) return <Panel className="border-red-400/20 p-5 text-red-100">{notice || "Could not open this match."}</Panel>;

  const timelineDuration = duration || match.video?.durationSeconds || Math.max(1, ...match.moments.map((moment) => moment.endTimeSeconds));
  const currentPeriod = getMatchPeriodAtTime(match, currentTime);
  const lastMoment = match.moments.reduce<MomentRecord | null>((latest, moment) => !latest || Date.parse(moment.createdAt) > Date.parse(latest.createdAt) ? moment : latest, null);

  return <div className="flex min-h-0 flex-col gap-2 xl:h-[calc(100dvh-6.5rem)] xl:overflow-hidden">
    <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => { void loadVideo(event.target.files?.[0]); event.currentTarget.value = ""; }} />

    <Panel className="flex shrink-0 items-stretch overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 border-r border-white/10 px-2">
        <Link href="/" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-slate-400 hover:bg-white/[.06] hover:text-white"><ArrowLeft size={12} />Matches</Link>
        <Badge className="max-w-36 truncate border-cyan-300/25 bg-cyan-300/10 text-[10px] text-cyan-100" title={`Analysing ${teamName}`}>Analysing: {teamName}</Badge>
        <button type="button" title="Edit match" aria-label="Edit match" onClick={() => setEditingMatch(true)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-white/[.06] hover:text-white"><Settings2 size={13} /></button>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-2 py-1.5" aria-label="Main moments in configured order">
        {settings.momentTypes.filter((type) => type.active).map((type) => { const active = activeMoments.some((item) => item.momentTypeId === type.id); return <button key={type.id} type="button" onClick={() => toggleMoment(type)} title={`${type.name}${type.defaultShortcut ? ` · ${type.defaultShortcut.toUpperCase()}` : ""}`} className={`flex h-11 min-w-[6rem] shrink-0 items-center justify-between gap-2 rounded-md border px-2 text-left transition ${active ? "border-cyan-200/70 bg-cyan-300/10 text-white shadow-[0_0_16px_rgba(34,211,238,.18)]" : "border-white/10 bg-white/[.035] hover:bg-white/[.08]"}`}><span className="min-w-0"><span className="block truncate text-[9px] font-bold" style={{ color: type.color }}>{type.name}</span><span className={`mt-0.5 block text-[8px] ${active ? "text-cyan-100" : "text-slate-600"}`}>{active ? "In progress" : "Click to start"}</span></span><kbd className="rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[9px] text-slate-300">{type.defaultShortcut || "—"}</kbd></button>; })}
      </div>
      <div className="flex shrink-0 items-center border-l border-white/10 px-1.5"><Button size="icon" className="mr-1 h-7 w-7" variant="secondary" disabled={uploading} title="Open cloud library" aria-label="Open cloud library" onClick={() => void openCloudLibrary()}><Cloud size={12} /></Button><Button size="icon" className="h-7 w-7" variant={uploading ? "danger" : "secondary"} title={uploading ? `Cancel upload (${Math.round(uploadProgress * 100)}%)` : match.video?.storageStatus === "READY" ? "Replace video" : "Upload video"} aria-label={uploading ? "Cancel video upload" : match.video?.storageStatus === "READY" ? "Replace video" : "Upload video"} onClick={() => uploading ? cancelUpload() : fileInputRef.current?.click()}>{uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}</Button></div>
    </Panel>
    {notice ? <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-leaf-400/25 bg-pitch-950/95 px-4 py-3 text-sm text-emerald-100 shadow-2xl backdrop-blur-xl"><span className="min-w-0 flex-1">{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)} className="shrink-0 text-emerald-200/70 transition hover:text-white"><X size={15} /></button></div> : null}
    {exporting ? <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-leaf-400/25 bg-pitch-950/95 px-4 py-3 text-sm text-emerald-100 shadow-2xl backdrop-blur-xl"><Loader2 size={16} className="shrink-0 animate-spin" /><span className="min-w-0 flex-1">{exportStatus}</span></div> : null}

    <div className="grid min-h-0 flex-1 items-stretch gap-2 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <Panel className="order-2 flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="relative aspect-video min-h-72 shrink-0 bg-black xl:aspect-auto xl:min-h-0 xl:flex-1">{sourceUrl ? <video ref={videoRef} src={sourceUrl} crossOrigin="anonymous" className="h-full w-full object-contain" controls={false} playsInline onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); event.currentTarget.playbackRate = playbackRate; }} onTimeUpdate={(event) => { const video = event.currentTarget; setCurrentTime(video.currentTime); if (previewEnd !== null && video.currentTime >= previewEnd - .04) { video.pause(); video.currentTime = previewEnd; setPreviewEnd(null); } }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} /> : <div className="flex h-full min-h-72 flex-col items-center justify-center p-6 text-center"><FileVideo size={56} className="text-cyan-200" /><h2 className="mt-4 text-xl font-semibold text-white">{restoringVideo ? "Loading the match video…" : match.video?.storageStatus === "LOCAL" ? "Upload the existing match video" : "Upload the match video"}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">The video will be stored privately in Cloudflare R2 and will be available on every device signed into this account.</p>{match.video ? <div className="mt-4 w-full max-w-lg rounded-md border border-cyan-300/25 bg-cyan-300/[.07] p-3 text-left"><p className="text-[10px] font-medium uppercase tracking-[.18em] text-cyan-200/70">Expected video</p><p className="mt-1 truncate text-sm font-medium text-cyan-50">{match.video.fileName}</p><p className="mt-1 text-xs text-slate-400">{formatBytes(match.video.fileSize)} · {formatTime(match.video.durationSeconds)}</p></div> : null}<div className="mt-5 flex flex-wrap justify-center gap-2"><Button variant="primary" onClick={() => fileInputRef.current?.click()}><Upload size={16} />Upload new</Button><Button variant="secondary" onClick={() => void openCloudLibrary()}><Cloud size={16} />Cloud library</Button></div></div>}{uploading ? <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10"><div className="h-full bg-cyan-300 transition-[width]" style={{ width: `${Math.round(uploadProgress * 100)}%` }} /></div> : null}</div>
        <div className="shrink-0 border-t border-white/10 bg-pitch-950/90 p-2">
          <input aria-label="Video position" type="range" min={0} max={Math.max(duration, .1)} step={.1} value={Math.min(currentTime, duration || 0)} disabled={!sourceUrl || !duration} onChange={(event) => seekTo(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-cyan-300 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: duration ? `linear-gradient(to right, #67e8f9 ${(currentTime / duration) * 100}%, rgba(255,255,255,.14) ${(currentTime / duration) * 100}%)` : undefined }} />
          <div className="mt-1.5 flex items-center gap-2">
            <div className="min-w-0 flex-1 overflow-x-auto"><div className="flex min-w-max items-center gap-1">
              <Button size="icon" className="h-8 w-8" variant="secondary" disabled={!sourceUrl} title="Back 15 seconds" onClick={() => seekBy(-15)}><ChevronsLeft size={15} /></Button>
              <Button size="icon" className="h-8 w-8" variant="secondary" disabled={!sourceUrl} title="Back 5 seconds (left arrow)" aria-label="Back 5 seconds with the left arrow" onClick={() => seekBy(-5)}><RotateCcw size={15} /></Button>
              <Button size="icon" className="h-8 w-8" variant="primary" disabled={!sourceUrl || saving} onClick={togglePlayback}>{playing ? <Pause size={15} /> : <Play size={15} />}</Button>
              <Button size="icon" className="h-8 w-8" variant="secondary" disabled={!sourceUrl} title="Forward 5 seconds (right arrow)" aria-label="Forward 5 seconds with the right arrow" onClick={() => seekBy(5)}><ChevronsRight size={15} /></Button>
              <Button size="icon" className="h-8 w-8" variant="secondary" disabled={!sourceUrl} title="Forward 15 seconds" onClick={() => seekBy(15)}><ChevronsRight size={15} className="scale-125" /></Button>
              <div className="flex overflow-hidden rounded-md border border-white/10">{[1, 2, 4].map((rate) => <button key={rate} type="button" onClick={() => setRate(rate)} className={`h-8 px-2 text-[10px] font-semibold transition ${playbackRate === rate ? "bg-cyan-300 text-slate-950" : "bg-white/[.04] text-slate-300 hover:bg-white/[.1]"}`}>{rate}×</button>)}</div>
              <Button size="icon" variant="danger" className="h-8 w-8" disabled={!lastMoment} title={lastMoment ? `Delete last recorded moment: ${lastMoment.momentType.name} at ${formatTime(lastMoment.startTimeSeconds)}` : "No recorded moment to delete"} aria-label="Delete last recorded moment" onClick={() => void removeLastMoment(lastMoment)}><Trash2 size={14} /></Button>
              <div className="ml-1 flex items-center gap-1 border-l border-white/10 pl-2" aria-label="Match period markers">
                {periodMarkers.map(([key, label], index) => { const seconds = match[key]; const style = periodStyles[index]; const period = index < 2 ? "first_half" : "second_half"; return <div key={key} className="flex overflow-hidden rounded-md border" style={{ borderColor: `${style.color}${currentPeriod === period ? "cc" : "55"}` }}><button type="button" disabled={!sourceUrl} title={seconds === null ? `${label}: save the current video time` : `${label}: go to ${formatTime(seconds)}`} onClick={() => seconds === null ? void setPeriodMarker(key) : seekTo(seconds)} className="flex h-8 min-w-[3.6rem] flex-col items-center justify-center px-1.5 leading-none disabled:opacity-40" style={{ backgroundColor: `${style.color}${currentPeriod === period ? "20" : "0c"}` }}><span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: style.color }}>{style.short}</span><span className="mt-0.5 font-mono text-[8px] text-slate-300">{seconds === null ? "Set" : formatTime(seconds)}</span></button>{seconds !== null ? <button type="button" disabled={!sourceUrl} aria-label={`Replace ${label} with the current video time`} title={`Replace ${label} with the current video time`} onClick={() => void setPeriodMarker(key)} className="flex h-8 w-5 items-center justify-center border-l text-slate-500 hover:text-white" style={{ borderColor: `${style.color}45` }}><Clock3 size={9} /></button> : null}</div>; })}
              </div>
              <form className="ml-1 flex items-center gap-1 border-l border-white/10 pl-2" onSubmit={(event) => { event.preventDefault(); goToExactTime(); }}><input aria-label="Exact second" className="h-8 w-20 rounded-md border border-white/10 bg-black/20 px-2 font-mono text-[10px] text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" type="number" min="0" max={duration || undefined} step="0.1" placeholder="Second" value={seekTime} onChange={(event) => setSeekTime(event.target.value)} disabled={!sourceUrl} /><Button type="submit" size="sm" className="h-8 px-2 text-[10px]" variant="secondary" disabled={!sourceUrl || seekTime === ""}>Go</Button></form>
            </div></div>
            <div className="flex shrink-0 items-center gap-1"><span className="hidden items-center gap-1 font-mono text-xs text-white sm:inline-flex"><Clock3 size={13} className="text-cyan-200" />{formatTime(currentTime)} / {formatTime(duration)}</span><Button size="sm" className="h-8 whitespace-nowrap px-2 text-[10px]" onClick={() => fileInputRef.current?.click()} disabled={uploading}><Upload size={12} />Upload video</Button><Button size="sm" className="h-8 whitespace-nowrap px-2 text-[10px]" onClick={() => void downloadFullVideo()} disabled={!match.video || downloadingVideo}>{downloadingVideo ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}Download full video</Button><Link href={`/analysis/${matchId}/submoments`}><Button size="sm" variant="primary" className="h-8 whitespace-nowrap px-2 text-[10px]" disabled={match.moments.length === 0 || activeMoments.length > 0}>Identify submoments <ChevronsRight size={13} /></Button></Link></div>
          </div>
        </div>
      </Panel>

      <Panel className="order-1 flex min-h-48 flex-col overflow-hidden xl:min-h-0">
        <div className="shrink-0 border-b border-white/10 px-3 py-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tagged moments</p><p className="mt-1 text-xs text-slate-400">{match.moments.length} in the video</p></div><Button size="sm" variant="secondary" className="shrink-0 px-2" disabled={match.moments.length === 0 || exporting} title={exporting ? exportStatus : "Export all tagged moments"} onClick={() => void exportAllMoments()}>{exporting ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}{exporting ? "Exporting" : "Export all"}</Button></div>{exporting && exportStatus ? <p className="mt-2 text-[10px] leading-4 text-cyan-100">{exportStatus}</p> : <p className="mt-2 text-[10px] leading-4 text-slate-500">Select a row to review or export.</p>}</div>
        <div className="min-h-0 flex-1 overflow-y-auto">{match.moments.length === 0 ? <p className="p-3 text-xs leading-5 text-slate-500">Completed moments appear here.</p> : match.moments.map((moment) => <div key={moment.id} className={`flex min-h-9 w-full flex-wrap items-start gap-1.5 border-b border-white/[.06] px-2.5 py-1 text-left transition hover:bg-white/[.06] ${selectedMomentId === moment.id ? "bg-cyan-300/10 text-cyan-100" : ""}`}><button type="button" className="flex min-w-0 flex-1 items-center gap-2" onClick={() => reviewMoment(moment)} title={`${moment.momentType.name} · ${formatTime(moment.startTimeSeconds)}`}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: moment.momentType.color }} /><span className="min-w-0 flex-1 truncate text-xs text-slate-200">{moment.momentType.name}</span><span className="shrink-0 font-mono text-[10px] text-slate-500">{formatTime(moment.startTimeSeconds)}</span></button><button aria-label="Mark as positive" onClick={() => void toggleOutcome(moment, "positive")} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border transition ${moment.outcome === "positive" ? "border-emerald-300 bg-emerald-400 text-emerald-950" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"}`}><Check size={11} /></button><button aria-label="Mark as negative" onClick={() => void toggleOutcome(moment, "negative")} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border transition ${moment.outcome === "negative" ? "border-red-300 bg-red-400 text-red-950" : "border-red-400/25 bg-red-400/10 text-red-300"}`}><X size={11} /></button><button type="button" className="inline-flex h-6 items-center gap-1 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-1.5 text-[10px] font-medium text-cyan-100 hover:bg-cyan-300/20" onClick={() => setEditingMoment(moment)} aria-label="Edit moment"><Pencil size={11} />Edit</button><button type="button" className="inline-flex h-6 items-center gap-1 rounded-md border border-red-400/30 bg-red-500/10 px-1.5 text-[10px] font-medium text-red-100 hover:bg-red-500/25" onClick={() => void removeMoment(moment)} aria-label="Delete moment"><Trash2 size={11} />Delete</button>{moment.notes ? <p className="w-full break-words rounded-sm border border-amber-300/20 bg-amber-300/10 px-1.5 py-0.5 text-[10px] leading-4 text-amber-200">{moment.notes}</p> : null}</div>)}</div>
      </Panel>

    </div>

    <Timeline momentTypes={settings.momentTypes} moments={match.moments} duration={timelineDuration} selectedMomentId={selectedMomentId} onSelect={reviewMoment} />

    {editingMoment ? <MomentEditDialog moment={editingMoment} momentTypes={settings.momentTypes} currentTime={currentTime} duration={duration || match.video?.durationSeconds || 0} onSave={(input) => updateMoment(editingMoment, input)} onClose={() => setEditingMoment(null)} /> : null}
    {editingMatch ? <MatchEditDialog match={match} onSave={saveMatch} onDelete={removeCurrentMatch} onClose={() => setEditingMatch(false)} /> : null}
    {showCloudLibrary ? <CloudVideoLibrary assets={cloudAssets} loading={loadingCloudLibrary} error={cloudLibraryError} attachingAssetId={attachingAssetId} onRetry={() => void openCloudLibrary()} onClose={() => !attachingAssetId && setShowCloudLibrary(false)} onSelect={(asset) => void attachSelectedCloudVideo(asset)} /> : null}
  </div>;
}

function Timeline({ momentTypes, moments, duration, selectedMomentId, onSelect }: { momentTypes: MomentTypeRecord[]; moments: MomentRecord[]; duration: number; selectedMomentId: string | null; onSelect: (moment: MomentRecord) => void }) {
  const visibleTypes = useMemo(() => momentTypes.filter((type) => type.active || moments.some((moment) => moment.momentTypeId === type.id)), [momentTypes, moments]);
  return <Panel className="flex shrink-0 flex-col overflow-hidden xl:h-24"><div className="flex shrink-0 items-center justify-between border-b border-white/10 px-2 py-1"><span className="text-[9px] font-semibold uppercase tracking-[.18em] text-slate-500">Timeline</span><span className="text-[9px] text-slate-500">Moments in the video</span></div><div className="min-h-0 flex-1 overflow-auto bg-black/20"><div className="min-w-[720px] overflow-hidden">{visibleTypes.map((type) => <div key={type.id} className="grid min-h-6 grid-cols-[8rem_minmax(0,1fr)] border-b border-white/[.07] last:border-b-0"><div className="flex items-center gap-2 border-r border-white/[.07] px-2 py-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: type.color }} /><span className="truncate text-[9px] text-slate-300">{type.name}</span></div><div className="relative min-h-6"><div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />{moments.filter((moment) => moment.momentTypeId === type.id).map((moment) => { const left = Math.max(0, Math.min(100, (moment.startTimeSeconds / duration) * 100)); const width = Math.max(.6, Math.min(100 - left, ((moment.endTimeSeconds - moment.startTimeSeconds) / duration) * 100)); return <button key={moment.id} type="button" title={`${type.name}: ${formatTime(moment.startTimeSeconds)} – ${formatTime(moment.endTimeSeconds)}`} onClick={() => onSelect(moment)} className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full border border-white/20 transition hover:h-4 ${selectedMomentId === moment.id ? "h-4 ring-1 ring-white/50" : ""}`} style={{ left: `${left}%`, width: `${width}%`, backgroundColor: type.color }} />; })}</div></div>)}</div></div></Panel>;
}

function safeExportName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim() || "Unnamed";
}

function toCsv(rows: string[][]) {
  return `\uFEFF${rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\r\n")}`;
}
