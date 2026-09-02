"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ListVideo, Loader2, Play, Plus, Trash2, Users, X } from "lucide-react";

import { Badge, Button, Input, Label, Panel, Select } from "@/components/ui";
import type { AccountPayload, LiveSessionRecord, MatchDetail, PlaylistRecord } from "@/lib/domain";
import { apiFetch } from "@/lib/http";
import { getRememberedMatchVideo } from "@/lib/local-video-store";
import { getRemoteVideoUrl } from "@/lib/remote-video-store";
import { formatTime } from "@/lib/time";

type PlaylistItem = PlaylistRecord["items"][number];

export function PlaylistsClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const localFilesRef = useRef(new Map<string, File>());
  const matchDetailsRef = useRef(new Map<string, MatchDetail>());
  const remoteUrlsRef = useRef(new Map<string, string>());
  const playRequestRef = useRef(0);
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [fullVideoUrl, setFullVideoUrl] = useState<string | null>(null);
  const [session, setSession] = useState<LiveSessionRecord | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(-1);
  const [playlistMode, setPlaylistMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const [nextAccount, nextPlaylists] = await Promise.all([apiFetch<AccountPayload>("/api/account"), apiFetch<PlaylistRecord[]>("/api/playlists")]);
    setAccount(nextAccount);
    setPlaylists(nextPlaylists);
    setPlaylistId((current) => current && nextPlaylists.some((playlist) => playlist.id === current) ? current : nextPlaylists.find((playlist) => playlist.userId === nextAccount.id && playlist.isDefault)?.id || nextPlaylists[0]?.id || "");
  }

  useEffect(() => { load().catch((error: Error) => setNotice(error.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => () => {
    playRequestRef.current += 1;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const playlist = playlists.find((item) => item.id === playlistId) || null;
  const selectedIndex = playlist?.items.findIndex((item) => item.id === selectedItemId) ?? -1;
  const selectedItem = selectedIndex >= 0 ? playlist!.items[selectedIndex] : null;
  const segment = segmentIndex >= 0 ? session?.segments[segmentIndex] || null : null;
  const isOwner = playlist?.userId === account?.id;
  const totalDuration = useMemo(() => playlist?.items.reduce((sum, item) => sum + item.moment.durationSeconds, 0) || 0, [playlist]);

  function releaseObjectUrl() {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }

  async function getMatchDetail(matchId: string) {
    const cached = matchDetailsRef.current.get(matchId);
    if (cached) return cached;
    const match = await apiFetch<MatchDetail>(`/api/matches/${matchId}`);
    matchDetailsRef.current.set(matchId, match);
    return match;
  }

  async function getFullVideoUrl(match: MatchDetail) {
    if (match.video?.storageStatus === "READY") {
      const cached = remoteUrlsRef.current.get(match.id);
      if (cached) return { url: cached, isObjectUrl: false };
      const remote = await getRemoteVideoUrl(match.id).catch(() => null);
      if (remote) {
        remoteUrlsRef.current.set(match.id, remote.url);
        return { url: remote.url, isObjectUrl: false };
      }
    }

    const cachedFile = localFilesRef.current.get(match.id);
    const file = cachedFile || await getRememberedMatchVideo(match.id).catch(() => null);
    if (!file) return null;
    localFilesRef.current.set(match.id, file);
    return { url: URL.createObjectURL(file), isObjectUrl: true };
  }

  async function playItem(item: PlaylistItem, continuePlaylist = false) {
    const request = ++playRequestRef.current;
    setSelectedItemId(item.id);
    setPlaylistMode(continuePlaylist);
    setNotice(null);
    setFullVideoUrl(null);
    setSession(null);
    setSegmentIndex(-1);
    releaseObjectUrl();
    try {
      const match = await getMatchDetail(item.moment.match.id);
      if (request !== playRequestRef.current) return;
      const videoSource = await getFullVideoUrl(match);
      if (request !== playRequestRef.current) {
        if (videoSource?.isObjectUrl) URL.revokeObjectURL(videoSource.url);
        return;
      }
      if (videoSource) {
        releaseObjectUrl();
        if (videoSource.isObjectUrl) objectUrlRef.current = videoSource.url;
        setFullVideoUrl(videoSource.url);
        return;
      }

      if (!item.moment.liveSessionId) throw new Error(`Upload the video for “${item.moment.match.title}” from its analysis page.`);
      const next = await apiFetch<LiveSessionRecord>(`/api/live-sessions/${item.moment.liveSessionId}`);
      if (request !== playRequestRef.current) return;
      const firstSegment = next.segments.findIndex((candidate) => candidate.startedAtSeconds + (candidate.durationSeconds || 0) > item.moment.startTimeSeconds);
      if (firstSegment < 0) throw new Error("The recording segments for this moment are not available yet.");
      setSession(next);
      setSegmentIndex(firstSegment);
      window.setTimeout(() => seekSegmentStart(item, next, firstSegment), 0);
    } catch (error) {
      if (request !== playRequestRef.current) return;
      setPlaylistMode(false);
      setNotice(error instanceof Error ? error.message : "The clip could not be loaded.");
    }
  }

  function seekFullVideoStart(item = selectedItem) {
    const video = videoRef.current;
    if (!video || !item) return;
    const lastPlayableSecond = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.01) : item.moment.startTimeSeconds;
    video.currentTime = Math.min(item.moment.startTimeSeconds, lastPlayableSecond);
    void video.play();
  }

  function seekSegmentStart(item = selectedItem, sourceSession = session, index = segmentIndex) {
    const video = videoRef.current;
    const sourceSegment = sourceSession?.segments[index];
    if (!video || !item || !sourceSegment) return;
    const seek = () => {
      video.currentTime = Math.max(0, item.moment.startTimeSeconds - sourceSegment.startedAtSeconds);
      void video.play();
    };
    if (video.readyState >= 1) seek(); else video.addEventListener("loadedmetadata", seek, { once: true });
  }

  function advanceSegment() {
    if (!selectedItem || !session) return;
    const next = session.segments[segmentIndex + 1];
    if (next && next.startedAtSeconds < selectedItem.moment.endTimeSeconds) {
      setSegmentIndex(segmentIndex + 1);
      return;
    }
    finishClip();
  }

  function finishClip() {
    videoRef.current?.pause();
    if (!playlistMode || !playlist || selectedIndex < 0 || selectedIndex >= playlist.items.length - 1) {
      setPlaylistMode(false);
      return;
    }
    void playItem(playlist.items[selectedIndex + 1], true);
  }

  function updatePlaybackTime(video: HTMLVideoElement) {
    if (!selectedItem) return;
    if (fullVideoUrl) {
      if (video.currentTime >= selectedItem.moment.endTimeSeconds - 0.04) finishClip();
      return;
    }
    if (!segment) return;
    if (segment.startedAtSeconds + video.currentTime >= selectedItem.moment.endTimeSeconds - 0.04) finishClip();
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const saved = await apiFetch<PlaylistRecord>("/api/playlists", { method: "POST", body: JSON.stringify({ name: newName, visibility: "PERSONAL" }) });
      setPlaylists((current) => [...current, saved]);
      setPlaylistId(saved.id);
      setNewName("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The playlist could not be created.");
    } finally {
      setCreating(false);
    }
  }

  async function removeItem(item: PlaylistItem) {
    if (!playlist || !isOwner) return;
    await apiFetch(`/api/playlists/${playlist.id}/items/${item.id}`, { method: "DELETE" });
    setPlaylists((current) => current.map((row) => row.id === playlist.id ? { ...row, items: row.items.filter((candidate) => candidate.id !== item.id) } : row));
    if (selectedItemId === item.id) {
      playRequestRef.current += 1;
      releaseObjectUrl();
      setSelectedItemId(null);
      setFullVideoUrl(null);
      setSession(null);
      setSegmentIndex(-1);
    }
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Loading playlists…</div>;

  return <div className="space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-[.22em] text-cyan-300">Half-time review</p><h1 className="mt-2 text-3xl font-bold text-white">Staff playlists</h1><p className="mt-2 text-sm text-slate-400">Every staff member can collect and review their own clips from the shared match recording.</p></header>
    {notice ? <div className="flex items-center justify-between rounded-lg border border-cyan-300/20 bg-cyan-300/[.07] p-3 text-sm text-cyan-50"><span>{notice}</span><button onClick={() => setNotice(null)}><X size={15} /></button></div> : null}
    <Panel className="grid gap-4 p-4 lg:grid-cols-[minmax(15rem,1fr)_minmax(18rem,1fr)]">
      <label className="grid gap-2"><Label>Playlist</Label><Select value={playlistId} onChange={(event) => { playRequestRef.current += 1; releaseObjectUrl(); setPlaylistId(event.target.value); setSelectedItemId(null); setFullVideoUrl(null); setSession(null); setSegmentIndex(-1); }}><option value="">Select a playlist</option>{playlists.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.user.name}{item.visibility === "WORKSPACE" ? " · shared" : ""}</option>)}</Select></label>
      <form onSubmit={create} className="flex items-end gap-2"><label className="grid min-w-0 flex-1 gap-2"><Label>New personal playlist</Label><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Goalkeeper corrections" /></label><Button variant="primary" disabled={creating || newName.trim().length < 2}><Plus size={15} />Create</Button></form>
    </Panel>
    {playlist ? <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <Panel className="overflow-hidden"><div className="flex items-center justify-between border-b border-white/10 p-3"><div><p className="font-semibold text-white">{playlist.name}</p><p className="text-xs text-slate-500">{playlist.items.length} clips · {formatTime(totalDuration)}</p></div><Button size="sm" variant="primary" disabled={playlist.items.length === 0} onClick={() => void playItem(playlist.items[0], true)}><Play size={13} />Play all</Button></div><div className="max-h-[38rem] overflow-y-auto">{playlist.items.length === 0 ? <div className="p-6 text-center text-sm text-slate-500"><ListVideo className="mx-auto mb-3 text-cyan-200" />Tag live moments to add them here automatically.</div> : playlist.items.map((item, index) => <div key={item.id} className={`flex items-center gap-2 border-b border-white/[.06] p-2 ${selectedItemId === item.id ? "bg-cyan-300/10" : ""}`}><button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => void playItem(item)}><span className="w-5 text-right font-mono text-[10px] text-slate-600">{index + 1}</span><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.moment.momentType.color }} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white">{item.moment.momentType.name}</span><span className="block truncate text-[10px] text-slate-500">{item.moment.match.title} · {formatTime(item.moment.startTimeSeconds)}–{formatTime(item.moment.endTimeSeconds)}</span></span><Play size={12} className="text-cyan-200" /></button>{isOwner ? <Button size="icon" variant="danger" className="h-7 w-7" onClick={() => void removeItem(item)}><Trash2 size={11} /></Button> : null}</div>)}</div></Panel>
      <Panel className="overflow-hidden"><div className="flex items-center justify-between border-b border-white/10 p-3"><div>{selectedItem ? <><p className="font-semibold text-white">{selectedItem.moment.match.title}</p><p className="text-xs text-slate-500">{selectedItem.moment.momentType.name} · {formatTime(selectedItem.moment.startTimeSeconds)}–{formatTime(selectedItem.moment.endTimeSeconds)}</p></> : <p className="text-sm text-slate-500">Select a clip to review it.</p>}</div>{selectedItem?.moment.createdBy ? <Badge><Users size={11} className="mr-1" />{selectedItem.moment.createdBy.name}</Badge> : null}</div><div className="aspect-video bg-black">{fullVideoUrl || segment?.playbackUrl ? <video key={fullVideoUrl ? `${selectedItemId}-full-${fullVideoUrl}` : `${selectedItemId}-segment-${segment?.id}`} ref={videoRef} src={fullVideoUrl || segment?.playbackUrl || undefined} controls autoPlay playsInline className="h-full w-full object-contain" onLoadedMetadata={() => fullVideoUrl ? seekFullVideoStart() : seekSegmentStart()} onTimeUpdate={(event) => updatePlaybackTime(event.currentTarget)} onEnded={() => fullVideoUrl ? finishClip() : advanceSegment()} /> : <div className="flex h-full items-center justify-center text-sm text-slate-600"><ListVideo className="mr-2" />No clip selected</div>}</div></Panel>
    </div> : <Panel className="p-8 text-center text-slate-500">No playlist selected.</Panel>}
  </div>;
}
