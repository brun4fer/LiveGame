export type MatchPeriod = "first_half" | "second_half";
export type AttackDirection = "left_to_right" | "right_to_left";

type MatchPeriodSettings = {
  firstHalfStartSeconds?: number | null;
  firstHalfEndSeconds?: number | null;
  secondHalfStartSeconds?: number | null;
  secondHalfEndSeconds?: number | null;
};

export function getMatchPeriodAtTime(match: MatchPeriodSettings, seconds: number): MatchPeriod | null {
  const firstStart = match.firstHalfStartSeconds;
  const firstEnd = match.firstHalfEndSeconds;
  if (firstStart !== null && firstStart !== undefined && firstEnd !== null && firstEnd !== undefined && seconds >= firstStart && seconds <= firstEnd) {
    return "first_half";
  }

  const secondStart = match.secondHalfStartSeconds;
  const secondEnd = match.secondHalfEndSeconds;
  if (secondStart !== null && secondStart !== undefined && secondEnd !== null && secondEnd !== undefined && seconds >= secondStart && seconds <= secondEnd) {
    return "second_half";
  }

  return null;
}

export function getAttackDirectionAtTime(match: MatchPeriodSettings, seconds: number): AttackDirection | null {
  const period = getMatchPeriodAtTime(match, seconds);
  if (!period) return null;
  return period === "second_half" ? "right_to_left" : "left_to_right";
}

export function matchPeriodLabel(period: MatchPeriod | null) {
  if (!period) return "Unassigned";
  return period === "second_half" ? "2nd half" : "1st half";
}

