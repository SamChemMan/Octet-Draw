// The clock of a motion made in script (motion.tsx tween): step gets how far the motion has got, 0 to 1 with the
// motion's easing, once a frame, and 1 last. The returned function stops it.
// The clock is the computer's, from the first frame that runs. The page's animation timeline keeps the time its frame
// began, so a glide started after a 150 ms Clean Up counted those 150 ms and showed only the last 30 ms of its 180 ms:
// in 1.1.1, where Clean Up got slower, most glides were gone (decision 0024). The Animation only gives the easing.
// The first frame only starts the clock: the caller has drawn 0 already, and drawing it again cost a large drawing a
// whole frame of the glide on a slow computer.
export function frames(step: (t: number) => void, at: { duration: number; easing: string }) {
  const motion = new Animation(new KeyframeEffect(null, null, at));
  let frame = 0, start: number | undefined;
  const tick = () => {
    const now = performance.now();
    if (start === undefined) { start = now; frame = requestAnimationFrame(tick); return; }
    const gone = now - start;
    motion.currentTime = Math.min(gone, at.duration);
    const t = gone >= at.duration ? 1 : motion.effect?.getComputedTiming().progress ?? 0;
    step(t);
    if (t < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
