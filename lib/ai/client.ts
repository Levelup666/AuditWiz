/**
 * LLM client abstraction for AI features.
 * Uses OpenAI API by default; designed for future provider swap.
 * Server-only: never expose API keys to client.
 */

import OpenAI from 'openai'
import { generateHash } from '@/lib/crypto'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

export interface LLMResponse {
  content: string
  modelVersion: string
  inputHash: string
  outputHash: string
}

/**
 * Call LLM with a prompt and return response with hashes for audit.
 * Returns null if AI is not configured (missing OPENAI_API_KEY).
 */
export async function callLLM(
  prompt: string,
  systemPrompt?: string
): Promise<LLMResponse | null> {
  const client = getClient()
  if (!client) return null

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const inputForHash = JSON.stringify({ prompt, systemPrompt })
  const inputHash = await generateHash(inputForHash)

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 1024,
  })

  const content = completion.choices[0]?.message?.content?.trim() ?? ''
  const modelVersion = completion.model
  const outputHash = await generateHash(content)

  return {
    content,
    modelVersion,
    inputHash,
    outputHash,
  }
}

/**
 * Check if AI features are available (API key configured).
 */
export function isAIAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}
