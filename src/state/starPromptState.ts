const DAY_MS = 24 * 60 * 60 * 1_000;
export const STAR_PROMPT_INTERVAL = 10;
export const STAR_PROMPT_COOLDOWN_MS = 2 * DAY_MS;
export const STAR_CLICK_COOLDOWN_MS = 30 * DAY_MS;
export interface StarState {
  successfulFormats: number;
  lastStarPromptAt?: number;
  lastStarClickAt?: number;
  starPromptCount: number;
}
export const INITIAL_STAR_STATE: StarState = {
  successfulFormats: 0,
  starPromptCount: 0,
};
const COPY = [
  "The easiest way to support Plaintext Formatter is to star the repository.",
  "If Plaintext Formatter is saving you time, a GitHub star helps the project grow.",
  "A star helps more developers discover Plaintext Formatter.",
];
export function recordSuccess(
  state: StarState,
  now: number,
  enabled = true,
): { state: StarState; message?: string } {
  const next = { ...state, successfulFormats: state.successfulFormats + 1 };
  if (
    !enabled ||
    next.successfulFormats % STAR_PROMPT_INTERVAL !== 0 ||
    (state.lastStarPromptAt !== undefined &&
      now - state.lastStarPromptAt < STAR_PROMPT_COOLDOWN_MS) ||
    (state.lastStarClickAt !== undefined &&
      now - state.lastStarClickAt < STAR_CLICK_COOLDOWN_MS)
  )
    return { state: next };
  next.lastStarPromptAt = now;
  next.starPromptCount++;
  return {
    state: next,
    message: `${next.successfulFormats} successful formats 🎉 ${COPY[state.starPromptCount % COPY.length]}`,
  };
}
