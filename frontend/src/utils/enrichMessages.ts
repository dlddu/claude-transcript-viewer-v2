import type { TranscriptMessage, Subagent, EnrichedMessage, EnrichedToolUse, MessageContent } from '../types/transcript';

function getMessageText(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter(block => block.type === 'text' && block.text)
    .map(block => block.text)
    .join('\n');
}

function getToolUseBlocks(content: MessageContent) {
  if (typeof content === 'string') {
    return [];
  }
  return content.filter(block => block.type === 'tool_use');
}

function findToolResultWithSource(
  messages: TranscriptMessage[],
  toolUseId: string
): { content: string; is_error?: boolean; sourceMessageUuid: string } | null {
  for (const msg of messages) {
    if (!msg.message || typeof msg.message.content === 'string') continue;

    const toolResult = msg.message.content.find(
      block => block.type === 'tool_result' && block.tool_use_id === toolUseId
    );

    if (toolResult) {
      return {
        content: typeof toolResult.content === 'string'
          ? toolResult.content
          : JSON.stringify(toolResult.content),
        is_error: toolResult.is_error,
        sourceMessageUuid: msg.uuid,
      };
    }
  }
  return null;
}

function isToolResultOnly(content: MessageContent): boolean {
  if (typeof content === 'string') return false;
  return content.length > 0 && content.every(block => block.type === 'tool_result');
}

function collectToolUseIds(messages: TranscriptMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const msg of messages) {
    if (!msg.message || typeof msg.message.content === 'string') continue;
    for (const block of msg.message.content) {
      if (block.type === 'tool_use' && block.id) {
        ids.add(block.id);
      }
    }
  }
  return ids;
}

function isFullyMatchedToolResultMessage(content: MessageContent, toolUseIds: Set<string>): boolean {
  if (typeof content === 'string') return false;
  if (!isToolResultOnly(content)) return false;
  return content.every(block => block.tool_use_id && toolUseIds.has(block.tool_use_id));
}

export function enrichMessages(
  messages: TranscriptMessage[],
  sessionId?: string,
  subagents?: Subagent[]
): EnrichedMessage[] {
  const toolUseIds = collectToolUseIds(messages);

  return messages
    .filter(msg => msg.type !== 'queue-operation' && msg.message)
    .filter(msg => !isFullyMatchedToolResultMessage(msg.message!.content, toolUseIds))
    .map(msg => {
      const isSubagent = !!(msg.agentId && msg.agentId !== sessionId);

      const subagentName = isSubagent
        ? subagents?.find(s => s.id === msg.agentId)?.name || msg.agentId!
        : null;

      const toolBlocks = getToolUseBlocks(msg.message!.content);
      const toolUses: EnrichedToolUse[] = toolBlocks.map(block => {
        let subagentType: string | undefined = undefined;

        // Extract subagent_type for Task tools
        if (block.name === 'Task' &&
            typeof block.input === 'object' &&
            block.input !== null &&
            'subagent_type' in block.input) {
          const rawSubagentType = (block.input as { subagent_type?: unknown }).subagent_type;
          if (typeof rawSubagentType === 'string' && rawSubagentType.length > 0) {
            subagentType = rawSubagentType;
          }
        }

        return {
          id: block.id!,
          name: block.name!,
          input: block.input,
          result: findToolResultWithSource(messages, block.id!),
          subagentType,
        };
      });

      return {
        raw: msg,
        text: getMessageText(msg.message!.content),
        isSubagent,
        subagentName,
        toolUses,
      };
    });
}
