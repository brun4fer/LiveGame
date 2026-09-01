"use client";

import { Cloud, FileVideo, FolderOpen, Loader2, X } from "lucide-react";

import { Button, Label, Panel } from "@/components/ui";
import type { CloudVideoAsset } from "@/lib/remote-video-store";
import { formatBytes, formatTime } from "@/lib/time";

type Props = {
  assets: CloudVideoAsset[];
  loading: boolean;
  error: string | null;
  attachingAssetId: string | null;
  onRetry: () => void;
  onClose: () => void;
  onSelect: (asset: CloudVideoAsset) => void;
};

export function CloudVideoLibrary({ assets, loading, error, attachingAssetId, onRetry, onClose, onSelect }: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <Panel className="flex max-h-[80dvh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-200"><FolderOpen size={18} /><Label>Shared cloud library</Label></div>
            <h2 className="mt-2 text-lg font-bold text-white">Choose an existing video</h2>
            <p className="mt-1 text-xs text-slate-400">Only videos belonging to this workspace are shown. Selecting one does not upload another copy.</p>
          </div>
          <Button size="icon" disabled={Boolean(attachingAssetId)} onClick={onClose} aria-label="Close cloud library"><X size={17} /></Button>
        </div>
        <div className="min-h-40 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400"><Loader2 size={18} className="animate-spin" />Loading cloud videos…</div>
          ) : error ? (
            <div className="flex h-40 flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-semibold text-red-200">Could not load the cloud library</p>
              <p className="mt-2 max-w-lg text-xs text-red-100/70">{error}</p>
              <Button className="mt-4" size="sm" onClick={onRetry}>Try again</Button>
            </div>
          ) : assets.length ? (
            <div className="space-y-2">
              {assets.map((asset) => (
                <button key={asset.id} type="button" disabled={Boolean(attachingAssetId)} onClick={() => onSelect(asset)} className="flex w-full items-center gap-3 rounded-md border border-white/10 bg-white/[.035] p-3 text-left transition hover:border-cyan-300/35 hover:bg-cyan-300/[.06] disabled:opacity-50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-300/10 text-cyan-200">{attachingAssetId === asset.id ? <Loader2 size={18} className="animate-spin" /> : <FileVideo size={18} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{asset.fileName}</span>
                    <span className="mt-1 block text-xs text-slate-500">{formatBytes(Number(asset.fileSize))} · {formatTime(asset.durationSeconds)}{asset.uploadedAt ? ` · ${new Date(asset.uploadedAt).toLocaleDateString()}` : ""}</span>
                  </span>
                  <span className="text-xs font-semibold text-cyan-200">Use video</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center text-center"><Cloud size={30} className="text-slate-600" /><p className="mt-3 text-sm font-medium text-slate-300">No shared videos yet</p><p className="mt-1 text-xs text-slate-500">Use Upload new to add the first video to this workspace.</p></div>
          )}
        </div>
      </Panel>
    </div>
  );
}

