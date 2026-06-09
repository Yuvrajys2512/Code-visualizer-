import { Billboard, Text } from '@react-three/drei'
import { languageColorHex } from '../palette'
import type { Layout } from '../types'

interface ClusterLabelsProps {
  layout: Layout
  focusSet: Set<string> | null
}

/**
 * Constellation names: each semantic cluster gets a heading floating above
 * its centroid, with its kind ("API endpoints", "UI components") beneath in
 * smaller type. Drawn through everything (no depth test) so the sky stays
 * readable from any angle; hidden entirely while a star is focused.
 */
export function ClusterLabels({ layout, focusSet }: ClusterLabelsProps) {
  if (focusSet) return null
  return (
    <>
      {layout.clusters.map((cluster) => {
        const size = 3.2 + Math.log2(1 + cluster.count) * 0.9
        return (
          <Billboard
            key={cluster.dir}
            position={[cluster.x, cluster.y + cluster.radius * 0.55 + 6, cluster.z]}
          >
            <Text
              fontSize={size}
              color="#dde6f5"
              fillOpacity={0.62}
              outlineWidth={0.05}
              outlineColor="#000000"
              outlineOpacity={0.7}
              anchorX="center"
              anchorY="bottom"
              renderOrder={10}
              material-depthTest={false}
            >
              {cluster.label}
            </Text>
            {cluster.kind && (
              <Text
                fontSize={size * 0.42}
                color={languageColorHex(cluster.language)}
                fillOpacity={0.5}
                outlineWidth={0.04}
                outlineColor="#000000"
                outlineOpacity={0.7}
                anchorX="center"
                anchorY="top"
                position={[0, -0.8, 0]}
                renderOrder={10}
                material-depthTest={false}
              >
                {cluster.kind}
              </Text>
            )}
          </Billboard>
        )
      })}
    </>
  )
}
