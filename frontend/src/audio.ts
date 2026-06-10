/**
 * Generative soundscape — pure Web Audio, no samples, ~zero bytes shipped.
 *
 * Three layers:
 *   ambient  slow detuned drone + filtered shimmer, the hum of deep space
 *   chimes   pentatonic plucks on hover / star ignition, pitched by significance
 *   rumble   sub-bass sweep + noise burst when a supernova detonates
 *
 * The context can only start on a user gesture; `wake()` is called from the
 * app's first pointerdown. Everything routes through one master gain so the
 * mute toggle is a single ramp.
 */

const MUTE_KEY = 'constellation-muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = localStorage.getItem(MUTE_KEY) === '1'
let lastChime = 0
let lastSparkle = 0

function now(): number {
  return ctx ? ctx.currentTime : 0
}

/** Create the context and start the ambient bed. Safe to call repeatedly. */
export function wake(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  const AC = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 1
  master.connect(ctx.destination)
  startAmbient()
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  if (ctx && master) {
    master.gain.cancelScheduledValues(now())
    master.gain.linearRampToValueAtTime(value ? 0 : 1, now() + 0.25)
  }
}

// ---------------------------------------------------------------------------
// Ambient bed
// ---------------------------------------------------------------------------

function startAmbient(): void {
  if (!ctx || !master) return
  const bed = ctx.createGain()
  bed.gain.value = 0
  bed.gain.linearRampToValueAtTime(1, now() + 4) // fade the void in gently
  bed.connect(master)

  // Detuned sines around a low A — beat frequencies do the slow breathing.
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 240
  filter.connect(bed)
  for (const [freq, gain] of [
    [55, 0.05],
    [55.3, 0.04],
    [82.41, 0.025],
    [110.2, 0.014],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = gain
    osc.connect(g).connect(filter)
    osc.start()
  }

  // Airy shimmer: looped noise squeezed through a wandering bandpass.
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer(ctx, 4)
  noise.loop = true
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 1600
  band.Q.value = 2.2
  const shimmer = ctx.createGain()
  shimmer.gain.value = 0.012
  noise.connect(band).connect(shimmer).connect(bed)
  noise.start()

  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.06
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 700
  lfo.connect(lfoDepth).connect(band.frequency)
  lfo.start()
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  return buffer
}

// ---------------------------------------------------------------------------
// Chimes
// ---------------------------------------------------------------------------

/** A-minor pentatonic across two octaves — any two notes sound consonant. */
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 784]

function pluck(freq: number, peak: number, decay: number): void {
  if (!ctx || !master || muted) return
  const t = now()
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  g.connect(master)
  for (const [mult, level] of [
    [1, 1],
    [2.001, 0.35],
    [2.997, 0.12],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq * mult
    const partial = ctx.createGain()
    partial.gain.value = level
    osc.connect(partial).connect(g)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }
}

/** Hover chime: brighter files ring higher and a touch louder. */
export function hoverChime(significance: number): void {
  if (!ctx) return
  const t = now()
  if (t - lastChime < 0.07) return
  lastChime = t
  const idx = Math.min(SCALE.length - 1, Math.floor(significance * SCALE.length))
  pluck(SCALE[idx], 0.05 + significance * 0.05, 0.5 + significance * 0.4)
}

/** Faint high plink when a star ignites during the time-lapse. */
export function igniteSparkle(significance: number): void {
  if (!ctx) return
  const t = now()
  if (t - lastSparkle < 0.08) return // many stars ignite at once; thin them out
  lastSparkle = t
  const idx = Math.min(SCALE.length - 1, 4 + Math.floor(significance * 6))
  pluck(SCALE[idx] * 2, 0.018 + significance * 0.03, 0.35)
}

// ---------------------------------------------------------------------------
// Supernova
// ---------------------------------------------------------------------------

export function supernovaRumble(magnitude: number): void {
  if (!ctx || !master || muted) return
  const t = now()
  const level = 0.35 + Math.min(1, magnitude) * 0.4

  // Sub-bass detonation sweeping downward.
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(110, t)
  sub.frequency.exponentialRampToValueAtTime(28, t + 1.6)
  const subGain = ctx.createGain()
  subGain.gain.setValueAtTime(0, t)
  subGain.gain.linearRampToValueAtTime(level, t + 0.04)
  subGain.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
  sub.connect(subGain).connect(master)
  sub.start(t)
  sub.stop(t + 2.5)

  // Shockwave air: noise through a collapsing lowpass.
  const burst = ctx.createBufferSource()
  burst.buffer = noiseBuffer(ctx, 3)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(3200, t)
  lp.frequency.exponentialRampToValueAtTime(120, t + 2.2)
  const burstGain = ctx.createGain()
  burstGain.gain.setValueAtTime(0, t)
  burstGain.gain.linearRampToValueAtTime(level * 0.5, t + 0.05)
  burstGain.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
  burst.connect(lp).connect(burstGain).connect(master)
  burst.start(t)
  burst.stop(t + 2.8)
}
