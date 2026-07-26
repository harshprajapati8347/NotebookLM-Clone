import { createOpenAI } from "@ai-sdk/openai";

const openaiProvider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Plan §5 specifies "OpenAI GPT-5.5" for grounded answer generation.
 * Overridable via OPENAI_CHAT_MODEL in case that model id isn't available
 * on a given OpenAI account/region — falls back to it as the default either
 * way, per the plan.
 */
export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5.5";

export const chatModel = openaiProvider(CHAT_MODEL);
