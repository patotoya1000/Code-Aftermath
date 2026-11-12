// Real-time driver: turns wall-clock time into simulation ticks. It owns NO game rules and never touches state
// directly — it only calls sim.step(n). Pausing, speed and frame pacing live here so the simulation itself stays a
// pure, deterministic tick counter (same seed + same commands at the same ticks ⇒ same result, at any speed).
export function createClockDriver(sim, { ticksPerSecond, speeds, maxTicksPerFrame, maxFrameMs = 250 }) {
  let paused = true;
  let speedIndex = 0;
  let acc = 0;

  return {
    get paused() { return paused; },
    get speed() { return speeds[speedIndex]; },
    get speeds() { return [...speeds]; },
    play() { paused = false; },
    pause() { paused = true; acc = 0; },
    toggle() { if (paused) this.play(); else this.pause(); return !paused; },
    setSpeed(n) { const i = speeds.indexOf(n); if (i < 0) throw new RangeError(`Unsupported speed ${n}`); speedIndex = i; },
    cycleSpeed() { speedIndex = (speedIndex + 1) % speeds.length; return speeds[speedIndex]; },
    /** Call once per animation frame with the elapsed milliseconds. Returns how many ticks ran. */
    update(dtMs) {
      if (paused || !(dtMs > 0)) return 0;
      acc += (Math.min(dtMs, maxFrameMs) / 1000) * ticksPerSecond * speeds[speedIndex];
      let n = Math.floor(acc + 1e-9); // epsilon: 1000/3 ms three times must still be one second
      if (n < 1) return 0;
      n = Math.min(n, maxTicksPerFrame);
      acc = Math.min(acc - n, 1); // drop any backlog beyond the cap instead of spiralling
      sim.step(n);
      return n;
    },
  };
}
