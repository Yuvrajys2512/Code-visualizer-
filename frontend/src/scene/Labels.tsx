import { useMemo } from 'react'
import { languageColorHex } from '../palette'
import type { Layout, PositionedNode } from '../types'
import { FadingLabel } from './FadingLabel'

interface LabelsProps {
  layout: Layout
  focusSet: Set<string> | null
  selectedId: string | null
}

const TOP_N = 9
const MAX_LABELS = 36

/**
 * Persistent labels only for the brightest stars (plus the focused
 * neighbourhood) — enough to orient by, never a wall of text.
 */
export function Labels({ layout, focusSet, selectedId }: LabelsProps) {
  const labelled = useMemo<PositionedNode[]>(() => {
    const ranked = [...layout.nodes].sort((a, b) => b.significance - a.significance)
    const chosen = new Map<string, PositionedNode>()
    if (focusSet) {
      for (const node of ranked) {
        if (chosen.size >= MAX_LABELS) break
        if (focusSet.has(node.id)) chosen.set(node.id, node)
      }
    } else {
      for (const node of ranked.slice(0, TOP_N)) chosen.set(node.id, node)
    }
    return [...chosen.values()]
  }, [layout, focusSet])

  return (
    <>
      {labelled.map((node) => {
        const emphasised = node.id === selectedId
        return (
          <FadingLabel
            key={node.id}
            position={[node.x, node.y + node.radius + 2.1, node.z]}
            text={node.name}
            fontSize={emphasised ? 2.9 : 1.9 + node.significance * 0.9}
            color={emphasised ? '#ffffff' : languageColorHex(node.language)}
            baseOpacity={emphasised ? 1 : 0.8}
            bold={emphasised}
            near={node.radius * 6 + 6}
            far={210}
          />
        )
      })}
    </>
  )
}
