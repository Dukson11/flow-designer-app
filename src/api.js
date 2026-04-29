const SYSTEM_PROMPT = `Si expert UX architect. Generuješ Mermaid flowchart diagramy z popisu user flow.

PRAVIDLÁ:
- Použi flowchart TD alebo LR podľa kontextu
- Každý node má krátky, výstižný label (max 3 slová)
- Screeny ako box: A[Login]
- Rozhodnutia ako diamond: B{Prihlásený?}
- Koniec/cieľ ako rounded: C(Dashboard)
- Hrany s popisom: A -->|Odoslať| B
- Pridaj chýbajúce stavy kde to dáva zmysel: chybový stav, prázdny stav, loading

VÝSTUP: iba validný JSON, bez markdown backticks:
{
  "mermaid": "flowchart TD\\n  ...",
  "analysis": {
    "added": ["čo som pridal čo nebolo v popise"],
    "missing": ["čo stále chýba"],
    "questions": ["otázky kde treba viac info"]
  }
}`

export async function generateMermaid(description, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Vytvor user flow diagram pre:\n\n' + description }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }

  const data = await res.json()
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  return JSON.parse(clean)
}

export async function updateNode(currentMermaid, nodeId, nodeLabel, changeDesc, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Existujúci Mermaid:\n\`\`\`\n${currentMermaid}\n\`\`\`\n\nZmeň iba node "${nodeId}" ("${nodeLabel}"): ${changeDesc}\n\nZachovaj všetky ostatné nody a prepojenia presne rovnaké.`,
      }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }
  const data = await res.json()
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  return JSON.parse(clean)
}

export async function updateMermaid(currentMermaid, comment, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Existujúci Mermaid:\n\`\`\`\n${currentMermaid}\n\`\`\`\n\nUprav podľa: ${comment}`,
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }

  const data = await res.json()
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  return JSON.parse(clean)
}
