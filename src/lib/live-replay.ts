export type ReplaySegmentLike = {
  id: string;
  startedAtSeconds: number;
  durationSeconds: number | null;
};

export type ReplayPosition<T extends ReplaySegmentLike> = {
  segment: T;
  offsetSeconds: number;
  virtualSeconds: number;
};

export function getReplayEdge(segments: ReplaySegmentLike[]) {
  return segments.reduce(
    (edge, segment) => Math.max(edge, segment.startedAtSeconds + Math.max(0, segment.durationSeconds || 0)),
    0,
  );
}

export function locateReplayPosition<T extends ReplaySegmentLike>(segments: T[], requestedSeconds: number): ReplayPosition<T> | null {
  if (segments.length === 0 || !Number.isFinite(requestedSeconds)) return null;
  const ordered = [...segments].sort((a, b) => a.startedAtSeconds - b.startedAtSeconds);
  const edge = getReplayEdge(ordered);
  const target = Math.max(0, Math.min(edge, requestedSeconds));
  const segment = [...ordered].reverse().find((item) => item.startedAtSeconds <= target) || ordered[0];
  const duration = Math.max(0, segment.durationSeconds || 0);
  const offsetSeconds = Math.max(0, Math.min(Math.max(0, duration - 0.02), target - segment.startedAtSeconds));
  return { segment, offsetSeconds, virtualSeconds: segment.startedAtSeconds + offsetSeconds };
}
