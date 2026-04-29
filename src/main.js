import cytoscape from 'cytoscape'
import dagre from 'dagre'
import cytoscapeDagre from 'cytoscape-dagre'
import { parseMermaid } from './parser.js'
import { formatForClaude, copyToClipboard } from './clipboard.js'

cytoscapeDagre(cytoscape, dagre)

// ── State ──────────────────────────────────────────────────
let cy = null
let selectedNodeId = null
const comments = new Map()  // nodeId → string

// ── DOM refs ───────────────────────────────────────────────
const mermaidInput   = document.getElementById('mermaid-input')
const btnRender      = document.getElementById('btn-render')
const btnFit         = document.getElementById('btn-fit')
const btnExport      = document.getElementById('btn-export')
const btnImport      = document.getElementById('btn-import')
const fileInput      = document.getElementById('file-input')
const parseError     = document.getElementById('parse-error')
const canvasHint     = document.getElementById('canvas-hint')
const nodePanel      = document.getElementById('node-panel')
const btnClosePanel  = document.getElementById('btn-close-panel')
const nodeIdEl       = document.getElementById('node-id')
const nodeLabelEl    = document.getElementById('node-label')
const nodeShapeEl    = document.getElementById('node-shape')
const nodeComment    = document.getElementById('node-comment')
const btnCopyClaude  = document.getElementById('btn-copy-claude')

// ── Cytoscape style ────────────────────────────────────────
const CY_STYLE = [
  {
    selector: 'node',
    style: {
      'background-color': '#1e293b',
      'border-width': 1.5,
      'border-color': '#38bdf8',
      'color': '#e2e8f0',
      'label': 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '12px',
      'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      'padding': '10px',
      'width': 'label',
      'height': 'label',
      'text-wrap': 'wrap',
      'text-max-width': '160px',
      'shape': 'roundrectangle',
      'transition-property': 'border-color, background-color',
      'transition-duration': '0.15s',
    }
  },
  {
    selector: 'node[shape = "diamond"]',
    style: { shape: 'diamond', padding: '18px' }
  },
  {
    selector: 'node[shape = "circle"]',
    style: { shape: 'ellipse', width: '60px', height: '60px' }
  },
  {
    selector: 'node[shape = "rounded"]',
    style: { shape: 'roundrectangle' }
  },
  {
    selector: 'node[shape = "stadium"]',
    style: { shape: 'roundrectangle', 'border-radius': '50%' }
  },
  {
    selector: 'node[shape = "cylinder"]',
    style: { shape: 'barrel' }
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#7dd3fc',
      'border-width': 2.5,
      'background-color': '#1a3349',
    }
  },
  {
    selector: 'node:active',
    style: { 'overlay-opacity': 0.1 }
  },
  {
    selector: 'edge',
    style: {
      'width': 1.5,
      'line-color': '#475569',
      'target-arrow-color': '#475569',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'label': 'data(label)',
      'font-size': '10px',
      'color': '#64748b',
      'text-background-color': '#0f172a',
      'text-background-opacity': 1,
      'text-background-padding': '2px',
      'edge-text-rotation': 'autorotate',
    }
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#38bdf8',
      'target-arrow-color': '#38bdf8',
    }
  }
]

// ── Init Cytoscape ─────────────────────────────────────────
function initCy() {
  cy = cytoscape({
    container: document.getElementById('cy'),
    style: CY_STYLE,
    wheelSensitivity: 0.3,
    minZoom: 0.05,
    maxZoom: 4,
    elements: [],
  })

  cy.on('tap', 'node', (e) => {
    const node = e.target
    selectNode(node)
  })

  cy.on('tap', (e) => {
    if (e.target === cy) {
      deselectNode()
    }
  })
}

// ── Render ─────────────────────────────────────────────────
function render() {
  const code = mermaidInput.value.trim()
  if (!code) return

  parseError.style.display = 'none'

  const { nodes, edges, errors } = parseMermaid(code)

  if (errors.length > 0) {
    parseError.textContent = errors.join('\n')
    parseError.style.display = 'block'
    if (nodes.length === 0) return
  }

  const elements = [
    ...nodes.map(n => ({
      data: { id: n.id, label: n.label, shape: n.shape }
    })),
    ...edges.map((e, i) => ({
      data: {
        id: `e${i}`,
        source: e.source,
        target: e.target,
        label: e.label || '',
      }
    }))
  ]

  cy.elements().remove()
  cy.add(elements)

  cy.layout({
    name: 'dagre',
    rankDir: detectDirection(mermaidInput.value),
    nodeSep: 50,
    rankSep: 70,
    edgeSep: 20,
    padding: 40,
    animate: true,
    animationDuration: 300,
  }).run()

  canvasHint.classList.add('hidden')
  deselectNode()
}

function detectDirection(code) {
  const m = code.match(/(?:flowchart|graph)\s+(TD|LR|BT|RL|TB)/i)
  if (!m) return 'TB'
  const dir = m[1].toUpperCase()
  if (dir === 'LR') return 'LR'
  if (dir === 'RL') return 'RL'
  if (dir === 'BT') return 'BT'
  return 'TB'
}

// ── Node selection ─────────────────────────────────────────
function selectNode(node) {
  selectedNodeId = node.id()
  const data = node.data()

  nodeIdEl.textContent = data.id
  nodeLabelEl.textContent = data.label
  nodeShapeEl.textContent = data.shape || 'box'
  nodeComment.value = comments.get(data.id) || ''

  nodePanel.classList.remove('hidden')
}

function deselectNode() {
  selectedNodeId = null
  nodePanel.classList.add('hidden')
  cy?.elements().unselect()
}

// ── Comment auto-save ──────────────────────────────────────
nodeComment.addEventListener('input', () => {
  if (selectedNodeId) {
    comments.set(selectedNodeId, nodeComment.value)
  }
})

// ── Copy for Claude ────────────────────────────────────────
btnCopyClaude.addEventListener('click', async () => {
  if (!selectedNodeId) return
  const node = cy.$(`#${CSS.escape(selectedNodeId)}`).first()
  const label = node.data('label') || selectedNodeId

  const text = formatForClaude({
    mermaidCode: mermaidInput.value,
    nodeId: selectedNodeId,
    nodeLabel: label,
    comment: comments.get(selectedNodeId) || '',
  })

  try {
    await copyToClipboard(text)
    showToast('Skopírované pre Claude!', 'success')
  } catch {
    showToast('Kopírovanie zlyhalo', 'error')
  }
})

// ── Export / Import ────────────────────────────────────────
btnExport.addEventListener('click', () => {
  const data = {
    mermaidCode: mermaidInput.value,
    comments: Object.fromEntries(comments),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'flow-diagram.json'
  a.click()
  URL.revokeObjectURL(url)
  showToast('Projekt exportovaný', 'success')
})

btnImport.addEventListener('click', () => fileInput.click())

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result)
      if (data.mermaidCode) {
        mermaidInput.value = data.mermaidCode
      }
      comments.clear()
      if (data.comments) {
        for (const [k, v] of Object.entries(data.comments)) {
          comments.set(k, v)
        }
      }
      render()
      showToast('Projekt importovaný', 'success')
    } catch {
      showToast('Neplatný JSON súbor', 'error')
    }
  }
  reader.readAsText(file)
  fileInput.value = ''
})

// ── Buttons ────────────────────────────────────────────────
btnRender.addEventListener('click', render)
btnFit.addEventListener('click', () => cy?.fit(undefined, 40))
btnClosePanel.addEventListener('click', deselectNode)

mermaidInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    render()
  }
})

// ── Toast ──────────────────────────────────────────────────
let toastTimer = null
function showToast(msg, type = '') {
  const toast = document.getElementById('toast')
  toast.textContent = msg
  toast.className = `toast ${type} show`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.classList.remove('show')
  }, 2200)
}

// ── Boot ───────────────────────────────────────────────────
initCy()
