/**
 * Lightweight ambient drone/pad generator for the Cosmos awakening sequence.
 * Pure Web Audio API — no asset files, no SSR issues (guarded behind `window`).
 */

const DRONE_FREQUENCIES = [55, 110, 164.81, 220]; // A1, A2, E3, A3

class AmbientAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private started = false;

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

  /** Fades in a soft multi-oscillator drone over `fadeSeconds`. */
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

    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0.12, now + fadeSeconds);
  }

  /** Fades the drone back out without tearing down the audio graph. */
  sleep(fadeSeconds = 2): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
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
