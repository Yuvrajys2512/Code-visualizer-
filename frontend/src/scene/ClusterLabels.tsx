import type { Layout } from '../types'
import { FadingLabel } from './FadingLabel'

interface ClusterLabelsProps {
  layout: Layout
  focusSet: Set<string> | null
}

/**
 * Constellation names: each semantic cluster gets a heading floating above
 * its centroid with its kind beneath in small caps. They fade away as you
 * fly inside the cluster (no text in your face) and while a star is focused.
 */
const MAX_HEADINGS = 10

export function ClusterLabels({ layout, focusSet }: ClusterLabelsProps) {
  if (focusSet) return null
  const shown = [...layout.clusters].sort((a, b) => b.count - a.count).slice(0, MAX_HEADINGS)
  return (
    <>
      {shown.map((cluster) => (
        <FadingLabel
          key={cluster.dir}
          position={[cluster.x, cluster.y + cluster.radius * 0.55 + 7, cluster.z]}
          text={cluster.label}
          subText={cluster.kind || undefined}
          fontSize={2.3 + Math.log2(1 + cluster.count) * 0.55}
          color="#edeff3"
          subColor="#82878f"
          baseOpacity={0.5}
          bold
          near={Math.max(26, cluster.radius * 1.15)}
          far={330}
          depthTest={false}
        />
      ))}
    </>
  )
}
