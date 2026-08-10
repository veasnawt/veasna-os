/**
 * Lightweight ambient drone/pad generator for the Cosmos awakening sequence.
 * Pure Web Audio API — no asset files, no SSR issues (guarded behind `window`).
 */

const DRONE_FREQUENCIES = [55, 110, 164.81, 220]; // A1, A2, E3, A3
// The drone's own volume ceiling once fully "awake" — the actual audible level is this times the
// user's own volume/mute settings (see setVolume/setMuted below), never this alone.
const AWAKE_GAIN = 0.12;

class AmbientAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private started = false;
  // Independent of started/awake: this is the OS-level "system volume" setting (see the taskbar's
  // volume control), which should already be in effect the moment the drone next awakens, not
  // require a separate call after the fact.
  private volume = 1;
  private muted = false;
  private awake = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Fades in a soft multi-oscillator drone over `fadeSeconds`, up to AWAKE_GAIN scaled by the
   *  current volume/mute setting (0 if muted) — never a hardcoded target, so a volume change made
   *  before the drone ever awakens still takes effect the first time it does. */
  awaken(fadeSeconds = 4): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    if (!this.started) {
      this.started = true;
      DRONE_FREQUENCIES.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i % 2 === 0 ? "sine" : "triangle";
        osc.frequency.value = freq;

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = 1 / DRONE_FREQUENCIES.length;

        osc.connect(voiceGain);
        voiceGain.connect(this.masterGain!);
        osc.start();
        this.oscillators.push(osc);
      });
    }

    this.awake = true;
    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(this.muted ? 0 : AWAKE_GAIN * this.volume, now + fadeSeconds);
  }

  /** Fades the drone back out without tearing down the audio graph. */
  sleep(fadeSeconds = 2): void {
    this.awake = false;
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
  }

  /** `fraction` is 0-1 — the taskbar's volume slider. Only actually audible while the drone is
   *  awake (see `awake`); otherwise this just records the setting for the next `awaken()`. */
  setVolume(fraction: number): void {
    this.volume = Math.min(1, Math.max(0, fraction));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.ctx || !this.masterGain || !this.awake) return;
    const now = this.ctx.currentTime;
    const target = this.muted ? 0 : AWAKE_GAIN * this.volume;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(target, now + 0.15);
  }

  /** A short confirmation blip at the current volume/mute level — played when the volume slider
   *  is released, same as a real OS's volume-key beep. Without this, the slider has NO audible
   *  effect at all outside 3D Cosmos mode (the only place `awaken()` is ever called), which reads
   *  as "the volume control doesn't work" even though it's actually just correctly controlling
   *  something that isn't currently playing. A one-shot tone straight to `ctx.destination`,
   *  independent of `masterGain`/the drone's own persistent state. */
  playTestTone(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.muted || this.volume <= 0) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2 * this.volume, now + 0.02);
    gain.gain.linearRampToValueAtTime(0, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  dispose(): void {
    this.oscillators.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
    });
    this.oscillators = [];
    this.started = false;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.masterGain = null;
  }
}

export const ambientAudio = new AmbientAudioEngine();
