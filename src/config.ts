import { z } from "zod";
import { parse as parseYaml } from "yaml";
import type { Config } from "./types";

const configSchema = z.object({
  channels: z.array(z.string()).min(1),
  pollIntervalMinutes: z.number().min(1).default(60),
  maxVideosPerChannel: z.number().min(1).default(10),
  server: z
    .object({
      port: z.number().default(3000),
      host: z.string().default("localhost"),
    })
    .default({}),
  cookies: z
    .object({
      browser: z.enum(["chrome", "firefox", "safari", "edge", "brave", "opera", "chromium"]).optional(),
      file: z.string().optional(),
    })
    .optional(),
  summarizer: z
    .object({
      provider: z.enum(["openai", "anthropic", "ollama"]),
      model: z.string(),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});

export async function loadConfig(path: string = "config.yaml"): Promise<Config> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    throw new Error(`Config file not found: ${path}`);
  }

  const content = await file.text();
  const raw = parseYaml(content);
  const parsed = configSchema.parse(raw);

  return parsed as Config;
}

export function validateChannelUrl(input: string): string {
  // Accept various formats:
  // - Full URL: https://www.youtube.com/channel/UC...
  // - Full URL: https://www.youtube.com/@handle
  // - Just the channel ID: UC...
  // - Just the handle: @handle

  if (input.startsWith("http")) {
    return input;
  }

  if (input.startsWith("@")) {
    return `https://www.youtube.com/${input}`;
  }

  if (input.startsWith("UC")) {
    return `https://www.youtube.com/channel/${input}`;
  }

  // Assume it's a handle without @
  return `https://www.youtube.com/@${input}`;
}
