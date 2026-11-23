import type { ZodType, ZodTypeDef } from "zod";

export interface StructuredLLMClient {
  readonly mode: "openai_compatible" | "offline_fallback";
  generateJson<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    schema: ZodType<T, ZodTypeDef, unknown>;
  }): Promise<T | null>;
}

/**
 * Calls any OpenAI-compatible Chat Completions endpoint (OpenAI, OpenRouter,
 * local LM Studio / Ollama) when LLM_API_KEY / OPENAI_API_KEY or LLM_BASE_URL is configured.
 * Returns null if unconfigured so callers can cleanly fall back to the local narrative engine.
 */
export class OpenAICompatibleLLMClient implements StructuredLLMClient {
  readonly mode: "openai_compatible" | "offline_fallback";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts?: { baseUrl?: string; apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = (
      opts?.baseUrl ??
      process.env.LLM_BASE_URL ??
      process.env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    this.model = opts?.model ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
    this.mode =
      this.apiKey || process.env.LLM_BASE_URL
        ? "openai_compatible"
        : "offline_fallback";
  }

  async generateJson<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    schema: ZodType<T, ZodTypeDef, unknown>;
  }): Promise<T | null> {
    if (this.mode === "offline_fallback") return null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return params.schema.parse(parsed);
  }
}
