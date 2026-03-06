import { useCallback, useRef, useState } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface UseConversationOptions {
  apiKey: string | null;
  systemPrompt: string;
  model?: string;
}

export interface UseConversationReturn {
  sendMessage: (userMessage: string) => Promise<string | null>;
  history: ChatMessage[];
  clearHistory: () => void;
  isProcessing: boolean;
  error: string | null;
}

const DEFAULT_MODEL = "gpt-4o-mini";

export function useConversation({
  apiKey,
  systemPrompt,
  model = DEFAULT_MODEL,
}: UseConversationOptions): UseConversationReturn {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (userMessage: string): Promise<string | null> => {
      if (!apiKey || !userMessage.trim()) return null;

      setError(null);
      setIsProcessing(true);

      const userEntry: ChatMessage = { role: "user", content: userMessage.trim() };

      // Build messages array with system prompt + history + new user message
      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userEntry.content },
      ];

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, messages }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content?.trim();
        if (!content) {
          throw new Error("Empty response from OpenAI");
        }

        const assistantEntry: ChatMessage = { role: "assistant", content };
        setHistory((prev) => [...prev, userEntry, assistantEntry]);
        return content;
      } catch (err) {
        if ((err as Error).name === "AbortError") return null;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        // Still add user message to history so context isn't lost
        setHistory((prev) => [...prev, userEntry]);
        return null;
      } finally {
        setIsProcessing(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [apiKey, history, model, systemPrompt],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    setError(null);
    abortRef.current?.abort();
  }, []);

  return { sendMessage, history, clearHistory, isProcessing, error };
}
