import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_STAR_STATE,
  recordSuccess,
  STAR_CLICK_COOLDOWN_MS,
  STAR_PROMPT_COOLDOWN_MS,
  type StarState,
} from "../../src/state/starPromptState";
test("1–9 have no prompt; 10 shows a milestone", () => {
  let state = INITIAL_STAR_STATE;
  for (let i = 1; i <= 10; i++) {
    const next = recordSuccess(state, 0);
    state = next.state;
    assert.equal(Boolean(next.message), i === 10);
    if (next.message) assert.match(next.message, /10 successful formats/);
  }
});
test("100 formats in one session produce one prompt", () => {
  let state = INITIAL_STAR_STATE;
  let prompts = 0;
  for (let i = 0; i < 100; i++) {
    const next = recordSuccess(state, 1_000);
    state = next.state;
    if (next.message) prompts++;
  }
  assert.equal(prompts, 1);
  assert.equal(state.successfulFormats, 100);
});
test("ignored prompt requires two days and a new milestone", () => {
  const state: StarState = {
    successfulFormats: 19,
    lastStarPromptAt: 0,
    starPromptCount: 1,
  };
  assert.equal(
    recordSuccess(state, STAR_PROMPT_COOLDOWN_MS - 1).message,
    undefined,
  );
  assert.match(
    recordSuccess(state, STAR_PROMPT_COOLDOWN_MS).message!,
    /20 successful formats/,
  );
  assert.equal(
    recordSuccess({ ...state, successfulFormats: 20 }, STAR_PROMPT_COOLDOWN_MS)
      .message,
    undefined,
  );
});
test("clicked user is eligible again after 30 days", () => {
  const state: StarState = {
    successfulFormats: 29,
    lastStarPromptAt: 0,
    lastStarClickAt: 1_000,
    starPromptCount: 1,
  };
  assert.equal(recordSuccess(state, STAR_CLICK_COOLDOWN_MS).message, undefined);
  assert.ok(recordSuccess(state, STAR_CLICK_COOLDOWN_MS + 1_000).message);
});
test("copy rotates between actual prompt appearances", () => {
  const first = recordSuccess(
    { ...INITIAL_STAR_STATE, successfulFormats: 9 },
    0,
  );
  const second = recordSuccess(
    { ...first.state, successfulFormats: 19 },
    STAR_PROMPT_COOLDOWN_MS,
  );
  assert.match(first.message!, /easiest way/);
  assert.match(second.message!, /saving you time/);
});
test("opt-out preserves local count but suppresses prompt", () => {
  const result = recordSuccess(
    { ...INITIAL_STAR_STATE, successfulFormats: 9 },
    0,
    false,
  );
  assert.equal(result.message, undefined);
  assert.equal(result.state.successfulFormats, 10);
});
test("backwards clock does not bypass cooldown", () =>
  assert.equal(
    recordSuccess(
      { successfulFormats: 19, lastStarPromptAt: 100, starPromptCount: 1 },
      0,
    ).message,
    undefined,
  ));
