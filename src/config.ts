// All tuning in one place. Each value says why it is what it is.
export const CONFIG = {
  /** Tile size in world pixels. 48 keeps a 7-tile-wide view on a 360px phone at zoom 1. */
  TILE: 48,
  /** Feet per square, per the 5e grid convention. */
  FEET_PER_SQUARE: 5,
  /** Torchlight radius in squares (20 ft bright light, SRD torch). */
  TORCH_RADIUS: 4,
  /** Darkvision adds this many squares of sight (60 ft is too generous on a tiny map). */
  DARKVISION_BONUS: 2,
  /** Short rests allowed between long rests. Two is the classic 5e adventuring-day pacing. */
  SHORT_RESTS_PER_LONG: 2,
  /** XP thresholds by level (SRD character advancement). */
  XP_LEVELS: [0, 300, 900] as number[],
  /** Highest level in this version. */
  MAX_LEVEL: 3,
  /** Exploration walk speed, ms per square. Fast enough not to bore, slow enough to read. */
  WALK_MS: 120,
  /** Combat token step, ms per square. */
  STEP_MS: 170,
  /** How long the d20 tumbles before settling (ms). Long enough to feel, short enough to repeat 50 times. */
  DICE_TUMBLE_MS: 800,
  /** How long the settled die stays up (ms). */
  DICE_HOLD_MS: 1300,
  /** Enemy turn pause between actions (ms), so the player can follow what happened. */
  AI_PAUSE_MS: 650,
  /** Zoom limits for pinch / wheel. */
  ZOOM_MIN: 0.55,
  ZOOM_MAX: 2.2,
  /** Save format version; bump when the shape changes. */
  SAVE_VERSION: 1,
  SAVE_KEY: 'emberdeep.save.v1',
  SETTINGS_KEY: 'emberdeep.settings.v1',
};
