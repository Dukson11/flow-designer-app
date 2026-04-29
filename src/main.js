import cytoscape from 'cytoscape'
import dagre from 'dagre'
import cytoscapeDagre from 'cytoscape-dagre'
import { parseMermaid } from './parser.js'
import { formatForClaude, copyToClipboard } from './clipboard.js'
import { generateMermaid, updateMermaid, updateNode as apiUpdateNode } from './api.js'

cytoscapeDagre(cytoscape, dagre)

// ── State ──────────────────────────────────────────────────
let cy = null
let selectedNodeId = null
let currentMermaid = ''
let busy = false
const comments = new Map()

// ── DOM refs ───────────────────────────────────────────────
const mermaidInput    = document.getElementById('mermaid-input')
const flowInput       = document.getElementById('flow-input')
const updateInput     = document.getElementById('update-input')
const btnRender       = document.getElementById('btn-render')
const btnFit          = document.getElementById('btn-fit')
const btnGenerate     = document.getElementById('btn-generate')
const btnUpdate       = document.getElementById('btn-update')
const genLabel        = document.getElementById('gen-label')
const updLabel        = document.getElementById('upd-label')
const btnExport       = document.getElementById('btn-export')
const btnImport       = document.getElementById('btn-import')
const fileInput       = document.getElementById('file-input')
const parseError      = document.getElementById('parse-error')
const canvasHint      = document.getElementById('canvas-hint')
const nodePanel       = document.getElementById('node-panel')
const btnClosePanel   = document.getElementById('btn-close-panel')
const nodeIdEl          = document.getElementById('node-id')
const nodeLabelInput    = document.getElementById('node-label-input')
const btnApplyLabel     = document.getElementById('btn-apply-label')
const nodeShapeSelect   = document.getElementById('node-shape-select')
const btnDeleteNode     = document.getElementById('btn-delete-node')
const nodeAiInput       = document.getElementById('node-ai-input')
const btnNodeAiUpdate   = document.getElementById('btn-node-ai-update')
const nodeAiLabel       = document.getElementById('node-ai-label')
const nodeComment       = document.getElementById('node-comment')
const btnCopyClaude     = document.getElementById('btn-copy-claude')
const updateSection   = document.getElementById('update-section')
const analysisPanel   = document.getElementById('analysis-panel')
const analysisBody    = document.getElementById('analysis-body')
const sdot            = document.getElementById('sdot')
const stxt            = document.getElementById('stxt')
const btnApiKey       = document.getElementById('btn-api-key')
const modalOverlay    = document.getElementById('modal-overlay')
const modalClose      = document.getElementById('modal-close')
const modalCancel     = document.getElementById('modal-cancel')
const modalSave       = document.getElementById('modal-save')
const apiKeyInput     = document.getElementById('api-key-input')

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
      'min-width': '80px',
      'min-height': '36px',
      'padding': '12px',
      'text-wrap': 'wrap',
      'text-max-width': '160px',
      'shape': 'roundrectangle',
    }
  },
  {
    selector: 'node[shape = "diamond"]',
    style: { shape: 'diamond', padding: '18px', 'background-color': '#2a1c0a', 'border-color': '#d4853a' }
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
    style: { 'line-color': '#38bdf8', 'target-arrow-color': '#38bdf8' }
  }
]

// ── Cytoscape init ─────────────────────────────────────────
function initCy() {
  cy = cytoscape({
    container: document.getElementById('cy'),
    style: CY_STYLE,
    userZoomingEnabled: true,
    elements: [],
  })

  cy.on('tap', 'node', (e) => selectNode(e.target))
  cy.on('tap', (e) => { if (e.target === cy) deselectNode() })
}

// ── Render Mermaid code → Cytoscape ───────────────────────
function render(code) {
  if (!code) return
  parseError.style.display = 'none'

  const { nodes, edges, errors } = parseMermaid(code)

  if (errors.length > 0) {
    parseError.textContent = errors.join('\n')
    parseError.style.display = 'block'
    if (nodes.length === 0) return
  }

  const elements = [
    ...nodes.map(n => ({ data: { id: n.id, label: n.label, shape: n.shape } })),
    ...edges.map((e, i) => ({
      data: { id: `e${i}`, source: e.source, target: e.target, label: e.label || '' }
    }))
  ]

  cy.elements().remove()
  cy.add(elements)
  cy.layout({
    name: 'dagre',
    rankDir: detectDirection(code),
    nodeSep: 60,
    rankSep: 80,
    padding: 40,
    animate: false,
    fit: true,
  }).run()
  cy.fit(undefined, 40)

  canvasHint.classList.add('hidden')
  deselectNode()
}

function detectDirection(code) {
  const m = code.match(/(?:flowchart|graph)\s+(TD|LR|BT|RL|TB)/i)
  if (!m) return 'TB'
  const d = m[1].toUpperCase()
  return { LR: 'LR', RL: 'RL', BT: 'BT' }[d] || 'TB'
}

// ── AI: Generate ───────────────────────────────────────────
async function doGenerate() {
  const desc = flowInput.value.trim()
  if (!desc || busy) return

  const apiKey = getApiKey()
  if (!apiKey) {
    openModal()
    showToast('Najprv nastav API kľúč', 'error')
    return
  }

  setBusy(true)
  setStatus('loading', 'Generujem diagram...')

  try {
    const result = await generateMermaid(desc, apiKey)
    currentMermaid = result.mermaid
    mermaidInput.value = currentMermaid
    render(currentMermaid)
    showAnalysis(result.analysis)
    updateSection.style.display = 'flex'
    setStatus('ok', 'Diagram vygenerovaný')
  } catch (e) {
    setStatus('err', e.message)
    showToast(e.message, 'error')
  }

  setBusy(false)
}

// ── AI: Update ─────────────────────────────────────────────
async function doUpdate() {
  const comment = updateInput.value.trim()
  if (!comment || !currentMermaid || busy) return

  const apiKey = getApiKey()
  if (!apiKey) { openModal(); return }

  setBusy(true)
  setStatus('loading', 'Aktualizujem...')

  try {
    const result = await updateMermaid(currentMermaid, comment, apiKey)
    currentMermaid = result.mermaid
    mermaidInput.value = currentMermaid
    updateInput.value = ''
    render(currentMermaid)
    showAnalysis(result.analysis)
    setStatus('ok', 'Diagram aktualizovaný')
  } catch (e) {
    setStatus('err', e.message)
    showToast(e.message, 'error')
  }

  setBusy(false)
}

// ── cytoscapeToMermaid ─────────────────────────────────────
function cytoscapeToMermaid() {
  const shapeOpen  = { box: '[', rounded: '(', diamond: '{', circle: '((', cylinder: '[(', stadium: '([' }
  const shapeClose = { box: ']', rounded: ')', diamond: '}', circle: '))', cylinder: ')]', stadium: '])' }

  const dir = detectDirection(currentMermaid) || 'TD'
  let code = `flowchart ${dir}\n`

  cy.nodes().forEach(n => {
    const id    = n.id()
    const label = n.data('label') || id
    const shape = n.data('shape') || 'box'
    const o = shapeOpen[shape]  || '['
    const c = shapeClose[shape] || ']'
    code += `    ${id}${o}${label}${c}\n`
  })

  cy.edges().forEach(e => {
    const src   = e.data('source')
    const tgt   = e.data('target')
    const label = e.data('label')
    code += label
      ? `    ${src} -->|${label}| ${tgt}\n`
      : `    ${src} --> ${tgt}\n`
  })

  return code
}

// ── Node panel ─────────────────────────────────────────────
function selectNode(node) {
  selectedNodeId = node.id()
  nodeIdEl.textContent    = node.id()
  nodeLabelInput.value    = node.data('label') || ''
  nodeShapeSelect.value   = node.data('shape') || 'box'
  nodeAiInput.value       = ''
  nodeComment.value       = comments.get(node.id()) || ''
  nodePanel.classList.remove('hidden')
}

function deselectNode() {
  selectedNodeId = null
  nodePanel.classList.add('hidden')
  cy?.elements().unselect()
}

// ── Manual: apply label ────────────────────────────────────
function applyLabel() {
  if (!selectedNodeId) return
  const newLabel = nodeLabelInput.value.trim()
  if (!newLabel) return
  cy.$(`#${CSS.escape(selectedNodeId)}`).data('label', newLabel)
  syncMermaid()
  showToast('Label aktualizovaný', 'success')
}

btnApplyLabel.addEventListener('click', applyLabel)
nodeLabelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); applyLabel() }
})

// ── Manual: change shape ───────────────────────────────────
nodeShapeSelect.addEventListener('change', () => {
  if (!selectedNodeId) return
  const shape = nodeShapeSelect.value
  const node  = cy.$(`#${CSS.escape(selectedNodeId)}`)
  node.data('shape', shape)
  // re-apply shape style
  const shapeMap = { box: 'roundrectangle', rounded: 'roundrectangle', diamond: 'diamond', circle: 'ellipse', cylinder: 'barrel' }
  node.style('shape', shapeMap[shape] || 'roundrectangle')
  if (shape === 'diamond') {
    node.style({ 'background-color': '#2a1c0a', 'border-color': '#d4853a', padding: '18px' })
  } else {
    node.style({ 'background-color': '#1e293b', 'border-color': '#38bdf8', padding: '12px' })
  }
  syncMermaid()
})

// ── Manual: delete node ────────────────────────────────────
btnDeleteNode.addEventListener('click', () => {
  if (!selectedNodeId) return
  cy.$(`#${CSS.escape(selectedNodeId)}`).remove()
  deselectNode()
  syncMermaid()
  showToast('Node zmazaný', 'success')
})

// ── AI: update specific node ───────────────────────────────
btnNodeAiUpdate.addEventListener('click', async () => {
  if (!selectedNodeId || busy) return
  const changeDesc = nodeAiInput.value.trim()
  if (!changeDesc) return

  const apiKey = getApiKey()
  if (!apiKey) { openModal(); return }

  const nodeLabel = cy.$(`#${CSS.escape(selectedNodeId)}`).data('label') || selectedNodeId

  busy = true
  btnNodeAiUpdate.disabled = true
  nodeAiLabel.innerHTML = '<div class="spinner" style="border-color:rgba(148,163,184,.3);border-top-color:#94a3b8"></div> Upravujem...'
  setStatus('loading', `Upravujem node "${nodeLabel}"...`)

  try {
    const result = await apiUpdateNode(currentMermaid, selectedNodeId, nodeLabel, changeDesc, apiKey)
    currentMermaid = result.mermaid
    mermaidInput.value = currentMermaid
    render(currentMermaid)
    nodeAiInput.value = ''
    showAnalysis(result.analysis)
    setStatus('ok', 'Node aktualizovaný')
    showToast('Node aktualizovaný cez AI', 'success')
  } catch (e) {
    setStatus('err', e.message)
    showToast(e.message, 'error')
  }

  busy = false
  btnNodeAiUpdate.disabled = false
  nodeAiLabel.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg> Upraviť cez AI'
})

// ── Sync Cytoscape → Mermaid code + server ────────────────
function syncMermaid() {
  const code = cytoscapeToMermaid()
  currentMermaid = code
  mermaidInput.value = code
  syncToServer(code)
}

nodeComment.addEventListener('input', () => {
  if (selectedNodeId) comments.set(selectedNodeId, nodeComment.value)
})

// ── Copy for Claude ────────────────────────────────────────
btnCopyClaude.addEventListener('click', async () => {
  if (!selectedNodeId) return
  const node = cy.$(`#${CSS.escape(selectedNodeId)}`).first()
  const text = formatForClaude({
    mermaidCode: currentMermaid || mermaidInput.value,
    nodeId: selectedNodeId,
    nodeLabel: node.data('label') || selectedNodeId,
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
  const data = { mermaidCode: mermaidInput.value, comments: Object.fromEntries(comments) }
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })),
    download: 'flow-diagram.json'
  })
  a.click()
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
        currentMermaid = data.mermaidCode
      }
      comments.clear()
      if (data.comments) {
        for (const [k, v] of Object.entries(data.comments)) comments.set(k, v)
      }
      render(mermaidInput.value)
      showToast('Projekt importovaný', 'success')
    } catch {
      showToast('Neplatný JSON súbor', 'error')
    }
  }
  reader.readAsText(file)
  fileInput.value = ''
})

// ── API Key modal ──────────────────────────────────────────
function getApiKey() { return localStorage.getItem('anthropic_api_key') || '' }
function saveApiKey(key) { localStorage.setItem('anthropic_api_key', key) }

function openModal() {
  apiKeyInput.value = getApiKey()
  modalOverlay.classList.remove('hidden')
  setTimeout(() => apiKeyInput.focus(), 50)
}
function closeModal() { modalOverlay.classList.add('hidden') }

btnApiKey.addEventListener('click', openModal)
modalClose.addEventListener('click', closeModal)
modalCancel.addEventListener('click', closeModal)
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal() })

modalSave.addEventListener('click', () => {
  const key = apiKeyInput.value.trim()
  if (!key) { showToast('Zadaj API kľúč', 'error'); return }
  saveApiKey(key)
  closeModal()
  showToast('API kľúč uložený', 'success')
  updateApiKeyIndicator()
})

function updateApiKeyIndicator() {
  const key = getApiKey()
  btnApiKey.style.borderColor = key ? 'var(--green)' : ''
  btnApiKey.style.color = key ? 'var(--green)' : ''
}

// ── Panel tabs ─────────────────────────────────────────────
document.querySelectorAll('.panel-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
    tab.classList.add('active')
    document.getElementById(`tab-${target}`).classList.add('active')
  })
})

// ── Helpers ────────────────────────────────────────────────
function setBusy(on) {
  busy = on
  btnGenerate.disabled = on
  btnUpdate.disabled = on
  if (on) {
    genLabel.innerHTML = '<div class="spinner"></div> Generujem...'
    updLabel.innerHTML = '<div class="spinner"></div> Aktualizujem...'
  } else {
    genLabel.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg> Generovať diagram'
    updLabel.textContent = '↻ Aktualizovať'
  }
}

function setStatus(type, text) {
  sdot.className = 'sdot ' + (type === 'loading' ? 'loading' : type === 'ok' ? 'ok' : type === 'err' ? 'err' : '')
  stxt.textContent = text
}

function showAnalysis(a) {
  if (!a) return
  const secs = [
    { key: 'added',    cls: 'tag-added',   label: '✓ Doplnené' },
    { key: 'missing',  cls: 'tag-missing',  label: '⚠ Chýba' },
    { key: 'questions',cls: 'tag-q',        label: '? Otázky' },
  ]
  let html = ''
  for (const s of secs) {
    const items = a[s.key]
    if (!items?.length) continue
    html += `<div class="analysis-section">
      <span class="analysis-tag ${s.cls}">${s.label}</span>
      <ul class="analysis-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>
    </div>`
  }
  if (html) {
    analysisBody.innerHTML = html
    analysisPanel.style.display = 'flex'
  }
}

let toastTimer = null
function showToast(msg, type = '') {
  const toast = document.getElementById('toast')
  toast.textContent = msg
  toast.className = `toast ${type} show`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200)
}

// ── Event listeners ────────────────────────────────────────
btnGenerate.addEventListener('click', doGenerate)
btnUpdate.addEventListener('click', doUpdate)
btnRender.addEventListener('click', () => {
  currentMermaid = mermaidInput.value
  render(currentMermaid)
  syncToServer(currentMermaid)
})
btnFit.addEventListener('click', () => cy?.fit(undefined, 40))
btnClosePanel.addEventListener('click', deselectNode)

mermaidInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    currentMermaid = mermaidInput.value
    render(currentMermaid)
  }
})

flowInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    doGenerate()
  }
})

// ── MCP sync ───────────────────────────────────────────────
let mcpUpdateInProgress = false

function syncToServer(diagram) {
  if (mcpUpdateInProgress) return
  fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ diagram }),
  }).catch(() => {})
}

function connectSSE() {
  const indicator = document.getElementById('mcp-indicator')
  const es = new EventSource('/api/events')

  es.addEventListener('connected', (e) => {
    indicator.classList.add('connected')
    indicator.title = 'MCP: Flow Designer je pripojený'
    // Sync server state to browser on connect
    const data = JSON.parse(e.data)
    if (data.diagram && !currentMermaid) {
      currentMermaid = data.diagram
      mermaidInput.value = data.diagram
      render(data.diagram)
    }
  })

  es.addEventListener('diagram', (e) => {
    const { diagram, source } = JSON.parse(e.data)
    if (source === 'mcp') {
      mcpUpdateInProgress = true
      currentMermaid = diagram
      mermaidInput.value = diagram
      render(diagram)
      showToast('Diagram aktualizovaný cez MCP', 'success')
      setTimeout(() => { mcpUpdateInProgress = false }, 200)
    }
  })

  es.onerror = () => {
    indicator.classList.remove('connected')
    indicator.title = 'MCP: Nie je pripojený'
    // Reconnect after 3s
    es.close()
    setTimeout(connectSSE, 3000)
  }
}

// ── Boot ───────────────────────────────────────────────────
initCy()
updateApiKeyIndicator()
connectSSE()

if (!getApiKey()) {
  setStatus('', 'Nastav API kľúč pre AI generovanie')
} else {
  render(mermaidInput.value)
}
