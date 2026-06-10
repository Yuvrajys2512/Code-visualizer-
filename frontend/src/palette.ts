import * as THREE from 'three'

/**
 * Bioluminescent abyss palette: every hue lives in one cold luminous family
 * (blues, cyans, teals, seafoam, with rare jellyfish pinks/violets), so the
 * sky reads cohesive no matter the language mix. Nothing warm, nothing flat.
 */
export const LANGUAGE_COLORS: Record<string, string> = {
  python: '#3fd6c9',
  typescript: '#5d9eff',
  javascript: '#7ee8b2',
  go: '#4cc9f0',
  java: '#7d8eff',
  vue: '#46d595',
  svelte: '#ff8fb3',
  ruby: '#f072a8',
  rust: '#d9a0d4',
  kotlin: '#a78bfa',
  swift: '#6ee7d8',
  scala: '#c084fc',
  c: '#8b9dc3',
  cpp: '#8b9dc3',
  csharp: '#818cf8',
  php: '#6c8cd5',
}

export const DEFAULT_COLOR = '#6fa8b8'
/** Abyssal floor: the darkest point of the gradient, also the fog colour. */
export const VOID_COLOR = '#050d14'
/** The glow at the heart of the deep, behind the constellation. */
export const DEEP_GLOW_COLOR = '#0e2a3a'
/** The one accent: hover, selection, focus, controls. */
export const ACCENT_COLOR = '#4dd6c1'

const cache = new Map<string, THREE.Color>()

export function languageColor(language: string): THREE.Color {
  let c = cache.get(language)
  if (!c) {
    c = new THREE.Color(LANGUAGE_COLORS[language] ?? DEFAULT_COLOR)
    cache.set(language, c)
  }
  return c
}

export function languageColorHex(language: string): string {
  return LANGUAGE_COLORS[language] ?? DEFAULT_COLOR
}
