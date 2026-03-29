import type { Config } from "./types";

const SUMMARY_PROMPT = `You are a helpful assistant that summarizes YT video transcripts.
Given the following transcript, provide a concise summary that captures:
1. The main topic and key points
2. Any important conclusions or takeaways
3. Notable quotes or statements (if any)

Keep the summary between 100-300 words. Be factual and objective.

Transcript:
`;

export async function summarizeTranscript(
  transcript: string,
  config: Config["summarizer"]
): Promise<string | null> {
  if (!config) {
    return null;
  }

  const { provider, model, apiKey, baseUrl } = config;

  try {
    switch (provider) {
      case "openai":
        return await summarizeWithOpenAI(transcript, model, apiKey!, baseUrl);
      case "anthropic":
        return await summarizeWithAnthropic(transcript, model, apiKey!);
      case "ollama":
        return await summarizeWithOllama(transcript, model, baseUrl);
      default:
        console.error(`Unknown summarizer provider: ${provider}`);
        return null;
    }
  } catch (e) {
    console.error("Summarization failed:", e);
    return null;
  }
}

async function summarizeWithOpenAI(
  transcript: string,
  model: string,
  apiKey: string,
  baseUrl?: string
): Promise<string> {
  const url = baseUrl || "https://api.openai.com/v1";

  const response = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: SUMMARY_PROMPT + truncateTranscript(transcript),
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function summarizeWithAnthropic(
  transcript: string,
  model: string,
  apiKey: string
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: SUMMARY_PROMPT + truncateTranscript(transcript),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function summarizeWithOllama(
  transcript: string,
  model: string,
  baseUrl?: string
): Promise<string> {
  const url = baseUrl || "http://localhost:11434";

  const response = await fetch(`${url}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: SUMMARY_PROMPT + truncateTranscript(transcript),
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`);
  }

  const data = await response.json();
  return data.response;
}

function truncateTranscript(transcript: string, maxChars: number = 15000): string {
  if (transcript.length <= maxChars) {
    return transcript;
  }

  // Try to truncate at a sentence boundary
  const truncated = transcript.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf(".");

  if (lastPeriod > maxChars * 0.8) {
    return truncated.slice(0, lastPeriod + 1) + "\n\n[Transcript truncated]";
  }

  return truncated + "...\n\n[Transcript truncated]";
}
