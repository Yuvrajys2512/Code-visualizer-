import * as THREE from 'three'

/**
 * Obsidian palette: quiet, desaturated tints on near-black. Languages stay
 * distinguishable but never shout — brightness (significance) carries the
 * hierarchy, and a single electric-blue accent marks anything interactive.
 */
export const LANGUAGE_COLORS: Record<string, string> = {
  python: '#8fbcb2',
  typescript: '#8aa3cf',
  javascript: '#c9b98a',
  go: '#86afc4',
  java: '#c4a183',
  vue: '#8fb89a',
  svelte: '#c49180',
  ruby: '#c08c98',
  rust: '#bb9c8c',
  kotlin: '#a796c4',
  swift: '#c4a98a',
  scala: '#b78d8d',
  c: '#a497b1',
  cpp: '#a497b1',
  csharp: '#a29ac4',
  php: '#949cc0',
}

export const DEFAULT_COLOR = '#9aa0ab'
export const VOID_COLOR = '#0a0a0c'
/** The one accent: hover, selection, focus, controls. */
export const ACCENT_COLOR = '#5b8cff'

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
