import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { isManagementPasswordEnabled } from "./management-access";

const originalValue = process.env.NEXT_PUBLIC_MANAGEMENT_PASSWORD_ENABLED;

afterEach(() => {
  if (originalValue === undefined) delete process.env.NEXT_PUBLIC_MANAGEMENT_PASSWORD_ENABLED;
  else process.env.NEXT_PUBLIC_MANAGEMENT_PASSWORD_ENABLED = originalValue;
});

test("management passwords are disabled when the setting is absent", () => {
  delete process.env.NEXT_PUBLIC_MANAGEMENT_PASSWORD_ENABLED;
  assert.equal(isManagementPasswordEnabled(), false);
});

test("management passwords are only enabled explicitly", () => {
  process.env.NEXT_PUBLIC_MANAGEMENT_PASSWORD_ENABLED = "false";
  assert.equal(isManagementPasswordEnabled(), false);

  process.env.NEXT_PUBLIC_MANAGEMENT_PASSWORD_ENABLED = "true";
  assert.equal(isManagementPasswordEnabled(), true);
});
