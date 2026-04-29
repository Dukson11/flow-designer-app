export function formatForClaude({ mermaidCode, nodeId, nodeLabel, comment }) {
  const commentText = comment?.trim() || '(žiadny)'
  return `=== Flow Designer Context ===

\`\`\`mermaid
${mermaidCode.trim()}
\`\`\`

---
Vybraný node: **${nodeId}** — "${nodeLabel}"
Komentár: ${commentText}
===`
}

export async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text)
}
