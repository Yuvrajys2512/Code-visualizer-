import { Billboard, Text } from '@react-three/drei'
import { useMemo } from 'react'
import { languageColorHex } from '../palette'
import type { Layout, PositionedNode } from '../types'

interface LabelsProps {
  layout: Layout
  focusSet: Set<string> | null
  selectedId: string | null
}

const TOP_N = 14
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
          <Billboard key={node.id} position={[node.x, node.y + node.radius + 2.2, node.z]}>
            <Text
              fontSize={emphasised ? 3.4 : 2.1 + node.significance * 1.1}
              color={emphasised ? '#ffffff' : languageColorHex(node.language)}
              fillOpacity={emphasised ? 1 : 0.82}
              outlineWidth={0.06}
              outlineColor="#000000"
              outlineOpacity={0.85}
              anchorX="center"
              anchorY="bottom"
            >
              {node.name}
            </Text>
          </Billboard>
        )
      })}
    </>
  )
}
