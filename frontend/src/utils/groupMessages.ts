import type { EnrichedMessage, MessageGroup } from '../types/transcript';

export function groupMessages(messages: EnrichedMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];

  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];

    if (!msg.isSubagent) {
      groups.push({ type: 'main', messages: [msg] });
      i++;
    } else {
      const agentId = msg.raw.agentId!;
      const subagentName = msg.subagentName || agentId;
      const groupMessages: EnrichedMessage[] = [msg];
      i++;

      while (
        i < messages.length &&
        messages[i].isSubagent &&
        messages[i].raw.agentId === agentId
      ) {
        groupMessages.push(messages[i]);
        i++;
      }

      groups.push({
        type: 'subagent',
        groupKey: `${agentId}-${msg.raw.uuid}`,
        agentId,
        subagentName,
        messages: groupMessages,
      });
    }
  }

  return groups;
}
