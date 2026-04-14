export type HermesCommandContext = {
  messages?: unknown[]
  model?: string
  sessionId?: string
}

export type HermesSkillPrompt = (
  args: string,
  context: HermesCommandContext,
) => Promise<Array<{ type: 'text'; text: string }>>

export type HermesSkillDefinition = {
  name: string
  description: string
  aliases?: string[]
  whenToUse?: string
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  getPromptForCommand: HermesSkillPrompt
}

export type HermesCommandMeta = {
  name: string
  description: string
  aliases?: string[]
  whenToUse?: string
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
}

// Message types for AutoSkillCreator and ContextCompressor
export type MessageOrigin = {
  kind?: string
}

export type MessageBase = {
  uuid?: string
  parentUuid?: string
  timestamp?: string
  createdAt?: string
  isMeta?: boolean
  isVirtual?: boolean
  isCompactSummary?: boolean
  toolUseResult?: unknown
  origin?: MessageOrigin
}

export type UserMessage = MessageBase & {
  type: 'user'
  message: {
    content: string | Array<{ type: string; text?: string }>
  }
}

export type AssistantMessage = MessageBase & {
  type: 'assistant'
  message?: {
    content?: string | Array<{ type: string; name?: string; [key: string]: unknown }>
  }
}

export type SystemMessage = MessageBase & {
  type: 'system'
  subtype?: string
  level?: string
  message?: string
}

export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
