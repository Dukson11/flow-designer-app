/**
 * Lightweight Mermaid flowchart/graph parser → Cytoscape elements.
 * Supports: flowchart TD/LR/BT/RL, graph TD/LR
 * Node shapes: [] () {} [()] ([]) >]
 * Edges: --> --o --x -.-> ==> -->|label| -- text -->
 */

const SHAPE_PATTERNS = [
  { re: /^\[\((.+?)\)\]$/, shape: 'cylinder' },
  { re: /^\(\[(.+?)\]\)$/, shape: 'stadium' },
  { re: /^\[\[(.+?)\]\]$/, shape: 'subroutine' },
  { re: /^\[(.+?)\]$/, shape: 'box' },
  { re: /^\((.+?)\)$/, shape: 'rounded' },
  { re: /^\{(.+?)\}$/, shape: 'diamond' },
  { re: /^>(.+?)\]$/, shape: 'asymmetric' },
  { re: /^\(\((.+?)\)\)$/, shape: 'circle' },
]

function parseNodeDef(raw) {
  raw = raw.trim()
  for (const { re, shape } of SHAPE_PATTERNS) {
    const m = raw.match(re)
    if (m) return { label: m[1].trim(), shape }
  }
  return { label: raw, shape: 'box' }
}

// Edge pattern: captures source, optional label, target
// Handles: --> -.- -.-> ==> --o --x -- text --> -->|label|
const EDGE_RE = /([A-Za-z0-9_\-]+)\s*(?:--\|([^|]*)\||-\.?\->?|==+>?|--+>?|--+o|--+x)([A-Za-z0-9_\-]+)/g

// Full edge line with inline labels (various styles)
const EDGE_LINE_RE = /^([A-Za-z0-9_\-]+)(\s*[\w\[\(\{\>][^\n]*?)?\s*(-->|--o|--x|-\.->|==>|--[^->\n]+-->)\|?([^|]*)?\|?\s*([A-Za-z0-9_\-]+)(\s*[\w\[\(\{\>][^\n]*?)?$/

export function parseMermaid(code) {
  const nodes = new Map()   // id → { label, shape }
  const edges = []
  const errors = []

  const lines = code
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('%%'))

  // Skip directive line (flowchart TD / graph LR / etc.)
  const bodyLines = lines.filter(l =>
    !/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gitGraph|journey|pie|gantt)\b/i.test(l) &&
    !/^(classDef|class|linkStyle|style|subgraph|end)\b/i.test(l)
  )

  function ensureNode(id, rawDef) {
    if (!nodes.has(id)) {
      if (rawDef) {
        nodes.set(id, parseNodeDef(rawDef))
      } else {
        nodes.set(id, { label: id, shape: 'box' })
      }
    } else if (rawDef) {
      // Update label if we get a definition later
      const existing = nodes.get(id)
      if (existing.label === id) {
        nodes.set(id, parseNodeDef(rawDef))
      }
    }
  }

  // Tokenise each line into node/edge tokens
  // Strategy: split by edge arrows, keep remaining parts as node defs
  const ARROW_SPLIT = /(-->|--o|--x|-\.-?>?|={2,}>?|--[^->\[\(\{]*?-->)(?:\|([^|]*)\|)?/

  for (const line of bodyLines) {
    // Split line on arrows
    const parts = line.split(/(\s*(?:-->|--o|--x|-\.-?>?|={2,}>?|--[^->\[\(\{\s][^->\[\(\{]*?-->)\s*(?:\|[^|]*\|)?\s*)/)

    if (parts.length < 3) {
      // Standalone node definition
      const nodeRe = /^([A-Za-z0-9_\-]+)([\[\(\{\>].+)?$/
      const m = line.match(nodeRe)
      if (m) {
        const id = m[1]
        const def = m[2] ? m[2].trim() : null
        ensureNode(id, def)
      }
      continue
    }

    // Parse tokens: node [arrow [node arrow node ...]]
    const tokens = []
    for (const part of parts) {
      const p = part.trim()
      if (!p) continue
      // Is this an arrow segment?
      if (/^(?:-->|--o|--x|-\.-?>?|={2,}>?|--[^->\[\(\{][^->\[\(\{]*?-->)/.test(p)) {
        // Extract inline label if any
        const labelMatch = p.match(/\|([^|]*)\|/)
        tokens.push({ type: 'edge', label: labelMatch ? labelMatch[1].trim() : '' })
      } else {
        // Node token — may have definition appended
        const nodeRe = /^([A-Za-z0-9_\-]+)([\[\(\{\>].*)?$/
        const m = p.match(nodeRe)
        if (m) {
          tokens.push({ type: 'node', id: m[1], def: m[2] ? m[2].trim() : null })
        }
      }
    }

    // Walk tokens: node edge node edge node ...
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (t.type === 'node') {
        ensureNode(t.id, t.def)
        // Look ahead: if next is edge and one after is node → create edge
        if (i + 2 < tokens.length && tokens[i + 1].type === 'edge' && tokens[i + 2].type === 'node') {
          edges.push({
            source: t.id,
            target: tokens[i + 2].id,
            label: tokens[i + 1].label,
          })
        }
      }
    }
  }

  if (nodes.size === 0) {
    errors.push('Žiadne nody sa nepodarilo sparsovať. Skontrolujte syntax Mermaid kódu.')
  }

  return {
    nodes: Array.from(nodes.entries()).map(([id, data]) => ({ id, ...data })),
    edges,
    errors,
  }
}
