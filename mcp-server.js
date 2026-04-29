#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const BASE = process.env.FLOW_DESIGNER_URL || 'http://localhost:5173'

async function api(path, method = 'GET', body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Flow Designer API error: ${res.status}`)
  return res.json()
}

// ── Simple Mermaid text manipulation ──────────────────────
function addNodeToMermaid(mermaid, id, label, shape = 'box') {
  const shapeOpen  = { box: '[', rounded: '(', diamond: '{', circle: '((', cylinder: '[(' }
  const shapeClose = { box: ']', rounded: ')', diamond: '}', circle: '))',  cylinder: ')]' }
  const o = shapeOpen[shape]  || '['
  const c = shapeClose[shape] || ']'
  return mermaid.trimEnd() + `\n    ${id}${o}${label}${c}`
}

function deleteNodeFromMermaid(mermaid, id) {
  return mermaid
    .split('\n')
    .filter(line => {
      const l = line.trim()
      // Remove node definition and any edge involving this id
      if (new RegExp(`^${id}[\\[\\(\\{\\>]`).test(l)) return false
      if (new RegExp(`\\b${id}\\b`).test(l) && /-->|--o|--x/.test(l)) return false
      return true
    })
    .join('\n')
}

function updateNodeInMermaid(mermaid, id, newLabel) {
  return mermaid.replace(
    new RegExp(`(${id})[\\[\\(\\{]([^\\]\\)\\}]*)[\\]\\)\\}]`),
    (match, nid, _old, offset, str) => {
      const open  = match[nid.length]
      const close = { '[': ']', '(': ')', '{': '}', '[': ']' }[open] || ']'
      return `${nid}${open}${newLabel}${close}`
    }
  )
}

function addEdgeToMermaid(mermaid, source, target, label) {
  const edge = label
    ? `    ${source} -->|${label}| ${target}`
    : `    ${source} --> ${target}`
  return mermaid.trimEnd() + '\n' + edge
}

function parseNodesFromMermaid(mermaid) {
  const shapePatterns = [
    { re: /^([A-Za-z0-9_-]+)\[\((.+?)\)\]/, shape: 'cylinder' },
    { re: /^([A-Za-z0-9_-]+)\(\[(.+?)\]\)/, shape: 'stadium' },
    { re: /^([A-Za-z0-9_-]+)\[\[(.+?)\]\]/, shape: 'subroutine' },
    { re: /^([A-Za-z0-9_-]+)\[(.+?)\]/,     shape: 'box' },
    { re: /^([A-Za-z0-9_-]+)\((.+?)\)/,     shape: 'rounded' },
    { re: /^([A-Za-z0-9_-]+)\{(.+?)\}/,     shape: 'diamond' },
    { re: /^([A-Za-z0-9_-]+)\(\((.+?)\)\)/, shape: 'circle' },
  ]
  const nodes = []
  for (const line of mermaid.split('\n')) {
    const l = line.trim()
    for (const { re, shape } of shapePatterns) {
      const m = l.match(re)
      if (m) { nodes.push({ id: m[1], label: m[2], shape }); break }
    }
  }
  return nodes
}

// ── MCP Server ─────────────────────────────────────────────
const server = new Server(
  { name: 'flow-designer', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'flow_get_diagram',
      description: 'Get the current Mermaid flowchart code from Flow Designer',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'flow_set_diagram',
      description: 'Replace the entire diagram in Flow Designer with new Mermaid code',
      inputSchema: {
        type: 'object',
        required: ['diagram'],
        properties: {
          diagram: { type: 'string', description: 'Full Mermaid flowchart code' },
        },
      },
    },
    {
      name: 'flow_get_nodes',
      description: 'Get a list of all nodes in the current diagram',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'flow_add_node',
      description: 'Add a new node to the diagram',
      inputSchema: {
        type: 'object',
        required: ['id', 'label'],
        properties: {
          id:    { type: 'string', description: 'Unique node ID (alphanumeric, no spaces)' },
          label: { type: 'string', description: 'Node display text' },
          shape: { type: 'string', enum: ['box', 'rounded', 'diamond', 'circle', 'cylinder'], description: 'Node shape (default: box)' },
        },
      },
    },
    {
      name: 'flow_update_node',
      description: 'Update a node label in the diagram',
      inputSchema: {
        type: 'object',
        required: ['id', 'label'],
        properties: {
          id:    { type: 'string', description: 'Node ID to update' },
          label: { type: 'string', description: 'New label text' },
        },
      },
    },
    {
      name: 'flow_delete_node',
      description: 'Delete a node and all its edges from the diagram',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Node ID to delete' },
        },
      },
    },
    {
      name: 'flow_add_edge',
      description: 'Add a connection between two nodes',
      inputSchema: {
        type: 'object',
        required: ['source', 'target'],
        properties: {
          source: { type: 'string', description: 'Source node ID' },
          target: { type: 'string', description: 'Target node ID' },
          label:  { type: 'string', description: 'Optional edge label' },
        },
      },
    },
    {
      name: 'flow_status',
      description: 'Check if Flow Designer is open in the browser',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params

  try {
    if (name === 'flow_status') {
      const status = await api('/status')
      return { content: [{ type: 'text', text: status.connected
        ? `✓ Flow Designer is open (${status.clients} browser tab${status.clients !== 1 ? 's' : ''})`
        : '✗ Flow Designer is not open — run npm run dev and open http://localhost:5173'
      }]}
    }

    if (name === 'flow_get_diagram') {
      const data = await api('/diagram')
      return { content: [{ type: 'text', text: data.diagram || '(empty diagram)' }] }
    }

    if (name === 'flow_set_diagram') {
      await api('/diagram', 'POST', { diagram: args.diagram })
      return { content: [{ type: 'text', text: '✓ Diagram updated in Flow Designer' }] }
    }

    if (name === 'flow_get_nodes') {
      const data = await api('/diagram')
      const nodes = parseNodesFromMermaid(data.diagram || '')
      return { content: [{ type: 'text', text: nodes.length
        ? nodes.map(n => `• ${n.id} [${n.shape}]: "${n.label}"`).join('\n')
        : '(no nodes)'
      }]}
    }

    if (name === 'flow_add_node') {
      const data = await api('/diagram')
      const updated = addNodeToMermaid(data.diagram || 'flowchart TD', args.id, args.label, args.shape)
      await api('/diagram', 'POST', { diagram: updated })
      return { content: [{ type: 'text', text: `✓ Node "${args.id}" added` }] }
    }

    if (name === 'flow_update_node') {
      const data = await api('/diagram')
      const updated = updateNodeInMermaid(data.diagram, args.id, args.label)
      await api('/diagram', 'POST', { diagram: updated })
      return { content: [{ type: 'text', text: `✓ Node "${args.id}" updated to "${args.label}"` }] }
    }

    if (name === 'flow_delete_node') {
      const data = await api('/diagram')
      const updated = deleteNodeFromMermaid(data.diagram, args.id)
      await api('/diagram', 'POST', { diagram: updated })
      return { content: [{ type: 'text', text: `✓ Node "${args.id}" deleted` }] }
    }

    if (name === 'flow_add_edge') {
      const data = await api('/diagram')
      const updated = addEdgeToMermaid(data.diagram, args.source, args.target, args.label)
      await api('/diagram', 'POST', { diagram: updated })
      return { content: [{ type: 'text', text: `✓ Edge ${args.source} → ${args.target} added` }] }
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }

  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}\n\nMake sure Flow Designer is running: npm run dev` }], isError: true }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
