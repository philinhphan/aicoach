// app/page.tsx
'use client';

import { useChat, Message } from 'ai/react';
import { useEffect, useRef } from 'react'; // For auto-scrolling

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
    api: '/api/chat',
    onError: (err) => {
      // More specific error handling on client if needed
      console.error("Chat error from hook:", err);
    }
  });

  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto min-h-screen py-8 px-4">
        <header className="mb-6 text-center">
            <h1 className="text-3xl font-bold text-gray-800">AI Conversational Coach</h1>
            <p className="text-md text-gray-500">Hello Alex! Ask me about our knowledge resources or general topics.</p>
        </header>

        <div className="flex-grow overflow-y-auto space-y-4 mb-4 p-4 border rounded-lg shadow-sm bg-white h-[calc(100vh-200px)]">
            {messages.length > 0 ? (
                messages.map((m: Message) => (
                    <div key={m.id} className={`flex ${
                        m.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}>
                        <div className={`max-w-[70%] whitespace-pre-wrap px-4 py-2 rounded-xl shadow-md ${
                            m.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : 'bg-gray-100 text-gray-800 rounded-bl-none'
                        }`}>
                            <span className="font-semibold block text-sm mb-1">
                                {m.role === 'user' ? 'You (Alex)' : 'AI Coach'}
                            </span>
                            {m.content}
                        </div>
                    </div>
                ))
            ) : (
                <div className="text-center text-gray-400 pt-8">
                    <p>No messages yet. Try asking something like:</p>
                    <ul className="list-disc list-inside mt-2">
                        <li>"What are the key features of Product X?" (tries knowledge base)</li>
                        <li>"Tell me about the history of AI." (general knowledge)</li>
                    </ul>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="mb-2 p-3 border border-red-300 bg-red-50 text-red-600 rounded-md text-sm">
            <strong>Error:</strong> {error.message || "An unexpected error occurred. Please try again."}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center space-x-2 p-2 bg-gray-50 border-t sticky bottom-0">
            <input
                className="flex-grow p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                value={input}
                placeholder="Ask a question..."
                onChange={handleInputChange}
                disabled={isLoading}
                aria-label="Chat input"
            />
            <button
                type="submit"
                className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                disabled={isLoading || !input.trim()}
                aria-label="Send message"
            >
                {isLoading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : 'Send'}
            </button>
        </form>
    </div>
  );
}