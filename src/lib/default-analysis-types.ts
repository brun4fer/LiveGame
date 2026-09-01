export const defaultMomentTypes = [
  { code: "ORG_OF", name: "Offensive Organization", color: "#2dd66f", defaultShortcut: "1", sortOrder: 1 },
  { code: "ORG_DEF", name: "Defensive Organization", color: "#38bdf8", defaultShortcut: "2", sortOrder: 2 },
  { code: "TRANS_OF", name: "Offensive Transition", color: "#f59e0b", defaultShortcut: "3", sortOrder: 3 },
  { code: "TRANS_DEF", name: "Defensive Transition", color: "#ef4444", defaultShortcut: "4", sortOrder: 4 },
  { code: "SET_PIECES_OF", name: "Offensive Set Pieces", color: "#ec4899", defaultShortcut: "5", sortOrder: 5 },
  { code: "SET_PIECES_DEF", name: "Defensive Set Pieces", color: "#a78bfa", defaultShortcut: "6", sortOrder: 6 },
] as const;

export const defaultSubMomentTypes = [
  { code: "POSSESSION_LOSS", name: "Possession loss", color: "#ef4444", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: "T", sortOrder: 1 },
  { code: "THROW_IN_WON", name: "Throw-in won", color: "#06b6d4", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: null, sortOrder: 2 },
  { code: "FREE_KICK_WON", name: "Free kick won", color: "#8b5cf6", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: null, sortOrder: 3 },
  { code: "CORNER_WON", name: "Corner won", color: "#ec4899", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: null, sortOrder: 4 },
  { code: "DEPTH_ATTACK", name: "Attack in behind", color: "#f59e0b", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: null, sortOrder: 5 },
  { code: "CROSS", name: "Cross", color: "#38bdf8", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: "C", sortOrder: 6 },
  { code: "SHOT", name: "Shot", color: "#facc15", requiresFieldLocation: true, requiresGoalLocation: true, defaultShortcut: "S", sortOrder: 7 },
  { code: "GOAL", name: "Goal", color: "#22c55e", requiresFieldLocation: true, requiresGoalLocation: true, defaultShortcut: null, sortOrder: 8 },
  { code: "POSSESSION_RECOVERY", name: "Possession recovery", color: "#22c55e", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: "R", sortOrder: 9 },
  { code: "THROW_IN_CONCEDED", name: "Throw-in conceded", color: "#0ea5e9", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: null, sortOrder: 10 },
  { code: "FREE_KICK_CONCEDED", name: "Free kick conceded", color: "#a78bfa", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: null, sortOrder: 11 },
  { code: "CORNER_CONCEDED", name: "Corner conceded", color: "#f472b6", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: null, sortOrder: 12 },
  { code: "CROSS_CONCEDED", name: "Cross conceded", color: "#fb7185", requiresFieldLocation: true, requiresGoalLocation: false, defaultShortcut: null, sortOrder: 13 },
  { code: "SHOT_CONCEDED", name: "Shot conceded", color: "#f97316", requiresFieldLocation: true, requiresGoalLocation: true, defaultShortcut: null, sortOrder: 14 },
  { code: "GOAL_CONCEDED", name: "Goal conceded", color: "#dc2626", requiresFieldLocation: true, requiresGoalLocation: true, defaultShortcut: null, sortOrder: 15 },
] as const;

export const offensiveSubmomentCodes = [
  "POSSESSION_LOSS",
  "THROW_IN_WON",
  "FREE_KICK_WON",
  "CORNER_WON",
  "DEPTH_ATTACK",
  "CROSS",
  "SHOT",
  "GOAL",
] as const;

export const defensiveSubmomentCodes = [
  "POSSESSION_RECOVERY",
  "THROW_IN_CONCEDED",
  "FREE_KICK_CONCEDED",
  "CORNER_CONCEDED",
  "CROSS_CONCEDED",
  "SHOT_CONCEDED",
  "GOAL_CONCEDED",
] as const;

export function submomentCodesForMoment(momentCode: string): readonly string[] {
  return momentCode === "ORG_OF" || momentCode === "TRANS_OF" || momentCode === "SET_PIECES_OF"
    ? offensiveSubmomentCodes
    : momentCode === "ORG_DEF" || momentCode === "TRANS_DEF" || momentCode === "SET_PIECES_DEF"
      ? defensiveSubmomentCodes
      : [];
}
