/**
 * The mind: an OpenAI chat over the conversation so far, answering each
 * turn with what to say and the expression to say it with — one of the
 * ROS4HRI expression names the face understands.
 */

export interface Reply {
  text: string;
  /** A ROS4HRI expression name (`happy`, `sad`, …), `neutral` by default. */
  expression: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const EXPRESSIONS = [
  "neutral",
  "angry",
  "sad",
  "happy",
  "surprised",
  "disgusted",
  "scared",
  "pleading",
  "vulnerable",
  "despaired",
  "guilty",
  "disappointed",
] as const;

export const DEFAULT_SYSTEM_PROMPT = `You are {{name}}, a friendly conversational robot face. Respond naturally and concisely: two or three sentences at most, so the conversation keeps its pace.
Answer with a JSON object and nothing else: {"text": "<what you say>", "expression": "<one of ${EXPRESSIONS.join(", ")}>"}.`;

const DEFAULT_MODEL = "gpt-4o-mini";

export class Thinker {
  readonly history: ChatMessage[] = [];
  private pending: AbortController | null = null;
  private readonly apiKey: string;
  private readonly systemPrompt: string;
  private readonly model: string;

  constructor(apiKey: string, systemPrompt: string, model = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.systemPrompt = systemPrompt;
    this.model = model;
  }

  /** The reply to `turn`; `null` when superseded by a newer turn. */
  async reply(turn: string): Promise<Reply | null> {
    const text = turn.trim();
    if (!text) return null;
    this.pending?.abort();
    const controller = new AbortController();
    this.pending = controller;
    const messages = [
      { role: "system", content: this.systemPrompt },
      ...this.history,
      { role: "user", content: text },
    ];
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(
          `OpenAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`,
        );
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("an empty reply");
      const reply = parseReply(content);
      this.history.push(
        { role: "user", content: text },
        { role: "assistant", content: reply.text },
      );
      return reply;
    } catch (err) {
      if ((err as Error).name === "AbortError") return null;
      throw err;
    } finally {
      if (this.pending === controller) this.pending = null;
    }
  }

  forget(): void {
    this.history.length = 0;
    this.pending?.abort();
  }
}

/** `{text, expression}` out of the model's answer, fences and all; plain
 * text is said neutrally. */
export function parseReply(raw: string): Reply {
  let str = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(str);
  if (fenced) str = fenced[1];
  try {
    const parsed = JSON.parse(str) as {
      text?: unknown;
      expression?: unknown;
      emotion?: unknown;
    };
    if (typeof parsed.text === "string") {
      const name =
        typeof parsed.expression === "string"
          ? parsed.expression
          : parsed.emotion;
      const expression = (EXPRESSIONS as readonly string[]).includes(
        String(name),
      )
        ? String(name)
        : "neutral";
      return { text: parsed.text, expression };
    }
  } catch {
    // not JSON
  }
  return { text: raw.trim(), expression: "neutral" };
}
