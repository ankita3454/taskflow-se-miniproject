import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PROJECT_NAME_MAX, validateProjectName } from "../src/utils/validation.js";

describe("project name validation", () => {
  test("requires a non-blank string", () => {
    for (const value of [undefined, null, "", "   ", 42, ["Project"]]) {
      assert.equal(validateProjectName(value), "Project name is required");
    }
  });

  test("accepts names up to 150 characters and rejects longer names", () => {
    assert.equal(validateProjectName("x".repeat(PROJECT_NAME_MAX)), null);
    assert.equal(
      validateProjectName("x".repeat(PROJECT_NAME_MAX + 1)),
      "Project name must be at most 150 characters",
    );
    assert.equal(validateProjectName("😀".repeat(PROJECT_NAME_MAX)), null);
    assert.equal(
      validateProjectName("😀".repeat(PROJECT_NAME_MAX + 1)),
      "Project name must be at most 150 characters",
    );
  });
});
