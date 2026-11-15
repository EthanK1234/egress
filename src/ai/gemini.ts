// Shared Gemini client. Every call asks for JSON that matches a schema.

import { GoogleGenAI, type ContentListUnion } from "@google/genai";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is not set. Copy .env.example to .env and fill it in.");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

// Sends `contents` to the model and returns the parsed JSON reply.
// Throws on an API error, an empty reply, or a reply that isn't valid JSON.
export async function generateJson(contents: ContentListUnion, responseJsonSchema: unknown): Promise<unknown> {
  const model = import.meta.env.VITE_GEMINI_MODEL;
  if (!model) throw new Error("VITE_GEMINI_MODEL is not set. Copy .env.example to .env and fill it in.");
  const response = await getClient().models.generateContent({
    model,
    contents,
    config: { responseMimeType: "application/json", responseJsonSchema },
  });
  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty reply");
  return JSON.parse(text);
}
