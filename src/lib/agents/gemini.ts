import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (_client) return _client;
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  _client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return _client;
}

/** Primary model for function-calling agents */
export const AGENT_MODEL = "gemini-2.5-flash";

/** Higher-capability model for complex reasoning */
export const REASONING_MODEL = "gemini-2.5-pro";
