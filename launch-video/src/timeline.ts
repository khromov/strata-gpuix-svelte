/**
 * The music's grid. The track starts 3.47 s before its bass drop (69.23 s in), runs at 126 BPM,
 * and its bass cuts out for about 47 frames before the second eight-bar phrase at bar 8. So the
 * app arrives on the drop, the cow plays in the hush, and Ask starts on the next phrase.
 * Scene code uses these absolute frame numbers directly.
 */
export const FPS = 30;
export const END = 944;
export const DROP = 104;
const BEAT = 14.28;

export const beat = (n: number) => Math.round(DROP + n * BEAT);
export const bar = (n: number) => beat(n * 4);

/** The frame the film turns from the light theme to the dark one. */
export const DARK_AT = bar(8);
