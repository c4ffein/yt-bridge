export interface Video {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  description: string;
  publishedAt: Date;
  url: string;
  thumbnail: string;
  duration: number;
  transcript?: string;
  summary?: string;
  fetchedAt: Date;
}

export interface Channel {
  id: string;
  name: string;
  url: string;
}

export interface Config {
  channels: string[];
  pollIntervalMinutes: number;
  maxVideosPerChannel: number;
  server: {
    port: number;
    host: string;
  };
  cookies?: {
    browser?: "chrome" | "firefox" | "safari" | "edge" | "brave" | "opera" | "chromium";
    file?: string;
  };
  summarizer?: {
    provider: "openai" | "anthropic" | "ollama";
    model: string;
    apiKey?: string;
    baseUrl?: string;
  };
}
