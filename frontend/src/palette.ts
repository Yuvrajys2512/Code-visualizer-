import * as THREE from 'three'

/** Neon-on-void palette. Hues are spaced so neighbouring clusters read apart. */
export const LANGUAGE_COLORS: Record<string, string> = {
  python: '#3ddbd9',
  typescript: '#6ea8ff',
  javascript: '#ffd166',
  go: '#4cc9f0',
  java: '#ff9e64',
  vue: '#42d392',
  svelte: '#ff6537',
  ruby: '#ff6b81',
  rust: '#f0a98e',
  kotlin: '#c792ea',
  swift: '#ffb86c',
  scala: '#e25555',
  c: '#b48ead',
  cpp: '#b48ead',
  csharp: '#a78bfa',
  php: '#8893d6',
}

export const DEFAULT_COLOR = '#9aa5b8'
export const VOID_COLOR = '#06070f'

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
