import { useFlowStore, PROMPT_HANDLE } from '@/lib/store'
import {
  buildStoryboardVideoGroups,
  parseStoryboardGroupHandle,
  parseStoryboardDurationSeconds,
  storyboardRowsToVideoPrompt,
  storyboardRowToPromptText,
} from '@/lib/storyboard-video-groups'

const PROMPT_SOURCE_TYPES = new Set(['text', 'promptAssistant', 'scene', 'storyboard', 'graphicBrief'])

function extractPromptText(type: string, content: string | undefined, sourceHandle?: string): string {
  if (!content) return ''
  if (type === 'storyboard') {
    try {
      const rows = JSON.parse(content)
      if (!Array.isArray(rows)) return content

      const group = parseStoryboardGroupHandle(sourceHandle)
      if (group) {
        const videoGroups = buildStoryboardVideoGroups(rows, group.maxDuration)
        const selectedGroup = videoGroups[group.groupIndex]
        return selectedGroup
          ? storyboardRowsToVideoPrompt(selectedGroup.rows, selectedGroup.start, selectedGroup.seconds, group.maxDuration)
          : content
      }

      if (sourceHandle?.startsWith('row-')) {
        const idx = parseInt(sourceHandle.slice(4), 10)
        const row = rows[idx]
        return row ? storyboardRowToPromptText(row, idx) : ''
      }
    } catch { return content }
  }
  if (type === 'scene') {
    try {
      const scene = JSON.parse(content)
      const parts = []
      if (scene.style) parts.push(`风格: ${scene.style}`)
      if (scene.description) parts.push(scene.description)
      if (scene.dialogue) parts.push(scene.dialogue)
      return parts.join('\n')
    } catch { return content }
  }
  return content
}

export interface ConnectedPrompt {
  sourceId: string
  edgeId: string
  label: string
  text: string
  disconnect: () => void
}

export function useConnectedPrompt(nodeId: string): ConnectedPrompt | null {
  const edges = useFlowStore((s) => s.edges)
  const nodes = useFlowStore((s) => s.nodes)
  const deleteEdge = useFlowStore((s) => s.deleteEdge)
  const removeEdgesWhere = useFlowStore((s) => s.removeEdgesWhere)

  // Priority 1: dedicated PROMPT_HANDLE
  const promptEdges = edges.filter(
    (e) => e.target === nodeId && e.targetHandle === PROMPT_HANDLE
  )
  const promptEdge = promptEdges[0]
  const storyboardRefEdges = edges.filter((edge) => {
    if (edge.target !== nodeId || edge.targetHandle !== 'tab-ref' || !edge.sourceHandle?.startsWith('row-')) return false
    const source = nodes.find((node) => node.id === edge.source)
    return source?.data.type === 'storyboard'
  })

  // Priority 2: text/promptAssistant/scene source on any tab handle
  const tabTextEdge = !promptEdge
    ? edges.find((e) => {
        if (e.target !== nodeId) return false
        const src = nodes.find((n) => n.id === e.source)
        return src && PROMPT_SOURCE_TYPES.has(src.data.type)
      })
    : undefined

  const activeEdge = promptEdge ?? storyboardRefEdges[0] ?? tabTextEdge
  if (!activeEdge) return null

  const sourceNode = nodes.find((n) => n.id === activeEdge.source)
  if (!sourceNode) return null

  const storyboardRowEdges = [...promptEdges, ...storyboardRefEdges].filter((edge) => {
    if (edge.source !== sourceNode.id || sourceNode.data.type !== 'storyboard') return false
    return edge.sourceHandle?.startsWith('row-')
  })
  if (storyboardRowEdges.length > 1) {
    try {
      const rows = JSON.parse((sourceNode.data.content as string) || '[]')
      if (Array.isArray(rows)) {
        const rowItems = storyboardRowEdges
          .map((edge) => {
            const index = parseInt((edge.sourceHandle ?? '').slice(4), 10)
            return Number.isFinite(index) && rows[index] ? { index, row: rows[index] as Record<string, unknown> } : null
          })
          .filter((item): item is { index: number; row: Record<string, unknown> } => !!item)
          .sort((a, b) => a.index - b.index)

        if (rowItems.length > 0) {
          const targetNode = nodes.find((n) => n.id === nodeId)
          const maxDuration = (() => {
            try {
              const meta = JSON.parse((targetNode?.data.meta as string) || '{}')
              return meta?.storyboardGroup?.maxDuration === 30 ? 30 : 15
            } catch {
              return 15
            }
          })()
          const seconds = rowItems.reduce(
            (sum, item) => sum + Math.max(1, parseStoryboardDurationSeconds(item.row.duration) || 4),
            0,
          )
          const edgeIds = new Set(storyboardRowEdges.map((edge) => edge.id))
          return {
            sourceId: sourceNode.id,
            edgeId: storyboardRowEdges[0].id,
            label: `${sourceNode.data.label} · ${rowItems.length}镜头`,
            text: storyboardRowsToVideoPrompt(rowItems.map((item) => item.row), rowItems[0].index, seconds, maxDuration),
            disconnect: () => removeEdgesWhere((edge) => edgeIds.has(edge.id)),
          }
        }
      }
    } catch {
      // Fall back to the first connected row below.
    }
  }

  const edgeId = activeEdge.id
  return {
    sourceId: sourceNode.id,
    edgeId,
    label: sourceNode.data.label,
    text: extractPromptText(sourceNode.data.type, sourceNode.data.content as string, activeEdge.sourceHandle ?? undefined),
    disconnect: () => deleteEdge(edgeId),
  }
}
