import assert from "node:assert/strict";
import test from "node:test";

import { defaultMomentTypes, defensiveSubmomentCodes, offensiveSubmomentCodes, submomentCodesForMoment } from "./default-analysis-types";

test("aligns offensive and defensive set pieces as shortcuts five and six", () => {
  assert.deepEqual(
    defaultMomentTypes.slice(4).map(({ code, defaultShortcut }) => [code, defaultShortcut]),
    [["SET_PIECES_OF", "5"], ["SET_PIECES_DEF", "6"]]
  );
});

test("shares the offensive taxonomy across all offensive moments", () => {
  assert.equal(offensiveSubmomentCodes.length, 8);
  for (const code of ["ORG_OF", "TRANS_OF", "SET_PIECES_OF"]) {
    assert.deepEqual(submomentCodesForMoment(code), offensiveSubmomentCodes);
  }
});

test("shares the defensive taxonomy across all defensive moments", () => {
  assert.equal(defensiveSubmomentCodes.length, 7);
  for (const code of ["ORG_DEF", "TRANS_DEF", "SET_PIECES_DEF"]) {
    assert.deepEqual(submomentCodesForMoment(code), defensiveSubmomentCodes);
  }
});

