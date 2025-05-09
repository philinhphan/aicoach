// app/api/chat/route.ts
import { NextRequest } from 'next/server';
import { Message as VercelChatMessage, LangChainAdapter } from 'ai';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from '@supabase/supabase-js';
import { Document } from "@langchain/core/documents";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, SystemMessage }
from "@langchain/core/messages";
import { DynamicTool } from "@langchain/core/tools";
import type { BaseRetrieverInterface } from "@langchain/core/retrievers";
import { convertVercelMessagesToLangChainMessages } from '@/lib/langchain_message_converter';

export const runtime = 'edge';

const USER_NAME = "Alex";

// --- REVISED AGENT SYSTEM PROMPT (Version 3) ---
const AGENT_SYSTEM_PROMPT_TEMPLATE = "You are a conversational coach trained to get provide helpful professional answers. For any sales related questions, use the provided search tool to find the most relevant information. If the search does not reveal any relevant information, then provide a general answer based on your training."


/* `You are an AI Conversational Coach for {USER_NAME}.
Your primary goal is to answer the user's questions accurately, clearly, and helpfully.

**Golden Rule: For simple, direct, common knowledge questions (e.g., "What is the capital of France?", "How tall is Mount Everest?"), you MUST answer them immediately and concisely using your own knowledge. Do NOT use tools, do NOT ask for clarification, and do NOT state the question is incomplete for these types of clear, simple questions.**

You have access to a tool called "search_knowledge_base" for questions that might require specific information from internal documents.

For questions that are not simple common knowledge, or if the user specifically asks for internal information, follow these considerations:

1.  **Understand the Question's Nature:**
    *   Determine if the question *specifically requests information likely found only in internal documents* (e.g., company-specific policies, internal project details, proprietary product information).
    *   Or, determine if it's a more complex general knowledge question that might benefit from thoughtful structuring but not necessarily internal documents.

2.  **Decision on Answering Strategy (for non-simple/document questions):**
    *   **For Document-Specific Questions:** If the question clearly requires information from internal documents, use the "search_knowledge_base" tool. Formulate a concise and relevant query for the tool.
    *   **For Other Questions:** If it's not a simple common knowledge question and not document-specific, use your best judgment to provide a comprehensive answer.

3.  **Using the "search_knowledge_base" Tool (If Applicable):**
    *   If you use the tool and it returns relevant information, base your answer primarily on this information.
    *   **Crucially, you MUST cite the source document(s)** (e.g., "According to 'document_name.pdf', ...") when using information retrieved by the tool. The source name is provided (e.g., "Source: filename.pdf").
    *   If the tool returns a message like "No relevant information found...", this means the *specific documents searched* do not contain the answer.

4.  **Formulating Your Final Answer:**
    *   If you answered from general knowledge (per the Golden Rule or for other general questions), provide that answer.
    *   If you used the tool and found information, synthesize it and provide the answer with citations.
    *   If you used the tool for a document-specific query and it found *no relevant information*, clearly state that the specific information wasn't found in the documents. Then, if appropriate and the question has a general component, you MAY offer a general knowledge answer or ask if the user wants a general perspective. Do NOT invent company-specific information.
    *   If, after all considerations, you genuinely cannot answer, then state that you don't have the information.

5.  **Handling User Interaction Nuances:**
    *   **Repeated Simple Questions:** If the user asks a simple, clear general knowledge question again, even if you've just answered it, provide the direct answer again concisely. Do not assume it's an error or incomplete.
    *   **Ambiguity:** If a question is genuinely ambiguous or complex (and not covered by the Golden Rule), then you may ask for clarification.

Be helpful, polite, and aim for clarity. Your default should be to answer clearly and directly.`; */

// --- Tool Definition (No change) ---
const createSearchTool = (retriever: BaseRetrieverInterface) => {
  return new DynamicTool({
    name: "search_knowledge_base",
    description: "Searches the internal knowledge base (e.g., PDFs, slides) for specific information. Use this for questions about company policies, product details, internal procedures, etc. Input should be a concise search query.",
    func: async (input: string | { query: string }): Promise<string> => {
      const query = typeof input === 'string' ? input : input.query;
      if (!query || query.trim() === "") {
        return "Tool Error: No query provided. Please provide a search query for the knowledge base.";
      }
      try {
        console.log(`Tool 'search_knowledge_base' called with query: "${query}"`);
        const docs: Document[] = await retriever.getRelevantDocuments(query);
        console.log(`Retrieved ${docs.length} documents from vector store for query: "${query}"`);

        if (docs.length === 0) {
          return "No relevant information found in the knowledge base for that query.";
        }
        const formattedDocs = "Found the following information in the knowledge base:\n" +
               docs.map(doc => `Source: ${doc.metadata?.source || 'Unknown Source'}\nContent: ${doc.pageContent}`).join("\n\n---\n");
        return formattedDocs;
      } catch (error: any) {
        console.error(`Error in 'search_knowledge_base' tool for query "${query}":`, error);
        return `Tool Error: An error occurred while searching the knowledge base: ${error.message}`;
      }
    },
  });
};

// --- Main POST Handler ---
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const vercelMessages: VercelChatMessage[] = body.messages ?? [];

        if (vercelMessages.length === 0) {
            return new Response(JSON.stringify({ error: "No messages provided" }), { status: 400 });
        }
        const currentInput = vercelMessages[vercelMessages.length - 1]?.content;
        if (!currentInput) {
            return new Response(JSON.stringify({ error: "No current message content found" }), { status: 400 });
        }
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.OPENAI_API_KEY) {
            return new Response(JSON.stringify({ error: "Missing environment variables" }), { status: 500 });
        }

        const supabaseClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
        const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY, modelName: "text-embedding-3-small" });

        const llm = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: 'gpt-4o-mini',
            temperature: 0.1, // Slightly lowered temperature further for more deterministic behavior with instructions
            streaming: true,
        });

        const vectorStore = new SupabaseVectorStore(embeddings, { client: supabaseClient, tableName: 'documents', queryName: 'match_documents' });
        const retriever = vectorStore.asRetriever({ k: 3 });
        const searchTool = createSearchTool(retriever);
        const tools = [searchTool];

        const systemPromptContent = AGENT_SYSTEM_PROMPT_TEMPLATE.replace("{USER_NAME}", USER_NAME);
        const prompt = ChatPromptTemplate.fromMessages([
            new SystemMessage(systemPromptContent),
            new MessagesPlaceholder("chat_history"),
            new HumanMessage("{input}"),
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
        const agentExecutor = new AgentExecutor({
            agent,
            tools,
            verbose: true, // KEEP THIS TRUE FOR DEBUGGING
            // handleParsingErrors: true, // Consider for production robustness
        });

        const chatHistory = convertVercelMessagesToLangChainMessages(vercelMessages.slice(0, -1));

        const eventStream = await agentExecutor.streamEvents(
            {
                input: currentInput,
                chat_history: chatHistory,
            },
            { version: "v2" } // Use streamEvents v2
        );

        const dataStream = LangChainAdapter.toDataStream(eventStream);

        return new Response(dataStream, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        });

    } catch (e: any) {
        console.error("Chat API Error (Outer Catch in POST):", e);
        return new Response(JSON.stringify({ error: e.message || "An unexpected error occurred in the chat API." }), { status: 500 });
    }
}