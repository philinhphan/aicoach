// lib/langchain_message_converter.ts
import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    ToolMessage, // If you ever need to pass pre-existing tool messages in history
} from "@langchain/core/messages";
import { Message as VercelChatMessage } from 'ai';

export const convertVercelMessagesToLangChainMessages = (messages: VercelChatMessage[]): BaseMessage[] => {
  return messages.map(message => {
    if (message.role === "user") {
      return new HumanMessage({ content: message.content });
    } else if (message.role === "assistant") {
      // For advanced history, you might include message.tool_calls here
      return new AIMessage({ content: message.content });
    }
    // Note: The AgentExecutor will manage its own ToolMessages in the 'agent_scratchpad'.
    // If you were to persist and reload agent conversations including tool interactions,
    // you'd handle VercelChatMessage roles like 'tool' more explicitly here.
    // For this MVP, focusing on Human/AI for chat_history is sufficient.
    console.warn(`Unknown message role during conversion: ${message.role}`);
    return new HumanMessage({ content: `Unknown role: ${message.content}` }); // Fallback
  });
};