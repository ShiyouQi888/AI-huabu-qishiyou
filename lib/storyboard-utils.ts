import type { Node } from '@xyflow/react'
import type { CustomNodeData } from './store'

export interface NamedAsset {
  name: string
  url?: string
  type: 'scene' | 'char' | 'prop'
  nodeId?: string
}

export interface StoryboardRowData {
  sceneImages: string[]
  characterImages: string[]
  propImages: string[]
  sceneImage?: string
  characterImage?: string
  duration?: string
  description?: string
  dialogue?: string
  camera?: string
  shotType?: string
  negativePrompt?: string
  aspectRatio?: string
  rowIndex: number
  namedAssets: NamedAsset[]
}

/** Extract plain name from a node label like "场景：直播间" → "直播间" */
function labelToName(label: string): string {
  return label.includes('：') ? label.split('：')[1] : label
}

export function getStoryboardRowData(
  node: Node<CustomNodeData>,
  sourceHandle?: string,
  allNodes?: Node<CustomNodeData>[],
): StoryboardRowData | null {
  if (node.data.type !== 'storyboard' || !sourceHandle?.startsWith('row-')) return null
  try {
    const rows = JSON.parse((node.data.content as string) || '[]')
    const idx = parseInt(sourceHandle.slice(4), 10)
    const row = rows[idx]
    if (!row) return null

    const sceneImages: string[] = row.sceneImages ?? (row.sceneImage ? [row.sceneImage] : [])
    const characterImages: string[] = row.characterImages ?? (row.characterImage ? [row.characterImage] : [])
    const propImages: string[] = row.propImages ?? []

    const namedAssets: NamedAsset[] = []

    if (allNodes) {
      const nodeById = (nid?: string) => nid ? allNodes.find((x) => x.id === nid) : undefined
      const imgOf = (nodeId?: string, fallback?: string): string | undefined =>
        (nodeById(nodeId)?.data.imageUrl as string | undefined) ?? fallback

      // Scene / location — prefer stored locationName, fall back to scene node label
      const sceneNodeId = row.sceneNodeId as string | undefined
      const sceneNode = nodeById(sceneNodeId)
      const locationName: string | undefined =
        (row.locationName as string | undefined) ??
        (sceneNode ? labelToName(sceneNode.data.label as string) : undefined)

      if (locationName) {
        namedAssets.push({
          name: locationName,
          url: imgOf(sceneNodeId, sceneImages[0]),
          type: 'scene',
          nodeId: sceneNodeId,
        })
      }

      // Characters — prefer stored characters array, otherwise skip (no fallback needed)
      const characters: string[] = row.characters ?? []
      const characterNodeIds: string[] = row.characterNodeIds ?? []
      characters.forEach((name: string, i: number) => {
        namedAssets.push({
          name,
          url: imgOf(characterNodeIds[i], characterImages[i]),
          type: 'char',
          nodeId: characterNodeIds[i],
        })
      })

      // Props — prefer stored propNames, fall back to prop node labels
      const propNodeIds: string[] = row.propNodeIds ?? []
      const storedPropNames: string[] = row.propNames ?? []
      const propNames = storedPropNames.length > 0
        ? storedPropNames
        : propNodeIds.map((nid: string) => {
            const n = nodeById(nid)
            return n ? labelToName(n.data.label as string) : ''
          }).filter(Boolean)

      propNames.forEach((name: string, i: number) => {
        namedAssets.push({
          name,
          url: imgOf(propNodeIds[i], propImages[i]),
          type: 'prop',
          nodeId: propNodeIds[i],
        })
      })
    }

    return {
      sceneImages,
      characterImages,
      propImages,
      sceneImage: sceneImages[0],
      characterImage: characterImages[0],
      duration: row.duration,
      description: row.description,
      dialogue: row.dialogue,
      camera: row.camera,
      shotType: row.shotType,
      negativePrompt: row.negativePrompt,
      aspectRatio: row.aspectRatio,
      rowIndex: idx,
      namedAssets,
    }
  } catch {
    return null
  }
}
