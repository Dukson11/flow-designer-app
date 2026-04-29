import { defineConfig } from 'vite'

// ── Shared state (persists across HMR) ────────────────────
const state = global.__flowDesignerState ??= {
  diagram: '',
  clients: new Set(),
}
global.__flowDesignerState = state

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of state.clients) {
    try { res.write(msg) } catch { state.clients.delete(res) }
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')) } catch (e) { reject(e) } })
  })
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default defineConfig({
  base: './',
  plugins: [{
    name: 'flow-designer-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api')) return next()

        cors(res)
        if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }

        const path = req.url.split('?')[0]

        // SSE — browser connects here for live updates
        if (path === '/api/events') {
          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')
          res.write(`event: connected\ndata: ${JSON.stringify({ diagram: state.diagram })}\n\n`)
          state.clients.add(res)
          req.on('close', () => state.clients.delete(res))
          return
        }

        // GET /api/diagram — MCP reads current diagram
        if (path === '/api/diagram' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ diagram: state.diagram, clients: state.clients.size }))
        }

        // POST /api/diagram — MCP writes diagram (broadcasts to browser)
        if (path === '/api/diagram' && req.method === 'POST') {
          const body = await parseBody(req).catch(() => null)
          if (!body?.diagram) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'missing diagram' })) }
          state.diagram = body.diagram
          broadcast('diagram', { diagram: state.diagram, source: 'mcp' })
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ ok: true }))
        }

        // POST /api/sync — browser keeps server state up to date
        if (path === '/api/sync' && req.method === 'POST') {
          const body = await parseBody(req).catch(() => null)
          if (body?.diagram !== undefined) state.diagram = body.diagram
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ ok: true }))
        }

        // GET /api/status — MCP checks if browser is connected
        if (path === '/api/status') {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ connected: state.clients.size > 0, clients: state.clients.size }))
        }

        next()
      })
    },
  }],
})
