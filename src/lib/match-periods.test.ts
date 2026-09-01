import assert from "node:assert/strict";
import test from "node:test";

import { getAttackDirectionAtTime, getMatchPeriodAtTime } from "./match-periods";

const match = {
  firstHalfStartSeconds: 10,
  firstHalfEndSeconds: 2710,
  secondHalfStartSeconds: 2900,
  secondHalfEndSeconds: 5600,
  firstHalfAttackDirection: "left_to_right",
  secondHalfAttackDirection: "right_to_left"
};

test("only assigns a period inside a complete marked range", () => {
  assert.equal(getMatchPeriodAtTime(match, 500), "first_half");
  assert.equal(getMatchPeriodAtTime(match, 2800), null);
  assert.equal(getMatchPeriodAtTime(match, 4000), "second_half");
  assert.equal(getMatchPeriodAtTime({ ...match, secondHalfEndSeconds: null }, 4000), null);
});

test("uses the fixed attack direction for each identified half", () => {
  assert.equal(getAttackDirectionAtTime(match, 500), "left_to_right");
  assert.equal(getAttackDirectionAtTime(match, 4000), "right_to_left");
  assert.equal(getAttackDirectionAtTime(match, 2800), null);
  const legacyDirections = { ...match, firstHalfAttackDirection: "right_to_left", secondHalfAttackDirection: "left_to_right" };
  assert.equal(getAttackDirectionAtTime(legacyDirections, 500), "left_to_right");
});

