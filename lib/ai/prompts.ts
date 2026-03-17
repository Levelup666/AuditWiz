/**
 * Prompt templates for AI features.
 * Kept separate for easy tuning and future localization.
 */

export function getRecordSummarizationPrompt(
  recordNumber: string,
  version: number,
  content: Record<string, unknown>
): string {
  const contentStr = JSON.stringify(content, null, 2)
  return `Summarize this research record in 2-4 sentences. Focus on the key findings, data, or context. Be concise and factual.

Record: ${recordNumber} (Version ${version})

Content:
${contentStr}`
}

export function getRecordSummarizationSystemPrompt(): string {
  return `You are a research assistant helping to summarize research records. Output only the summary text, no preamble or labels. Be objective and factual.`
}

export function getComplianceCheckPrompt(
  recordNumber: string,
  content: Record<string, unknown>,
  rules?: string[]
): string {
  const contentStr = JSON.stringify(content, null, 2)
  const rulesSection = rules?.length
    ? `\nCheck against these rules:\n${rules.map((r) => `- ${r}`).join('\n')}`
    : ''
  return `Analyze this research record for potential issues: missing required fields, inconsistent dates, or data quality concerns. List each finding on a new line with a brief explanation. If no issues found, respond with "No issues found."

Record: ${recordNumber}

Content:
${contentStr}${rulesSection}`
}

export function getComplianceCheckSystemPrompt(): string {
  return `You are a research compliance assistant. Output only the list of findings, one per line. Be specific and actionable.`
}

export function getAuditInsightsPrompt(
  eventCount: number,
  actionTypeCounts: Record<string, number>,
  dateRange: string
): string {
  const countsStr = Object.entries(actionTypeCounts)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ')
  return `Summarize this audit activity in 2-3 sentences. Highlight notable patterns or trends.

Period: ${dateRange}
Total events: ${eventCount}
Actions: ${countsStr}`
}

export function getAuditInsightsSystemPrompt(): string {
  return `You are an audit analyst. Output only the summary, no preamble. Be concise.`
}
