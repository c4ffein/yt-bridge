import type { Video, Channel, Config } from "./types";
import { validateChannelUrl } from "./config";
import { join } from "path";

// Use local binary if available, otherwise fall back to PATH
const YT_DLP_PATH = await (async () => {
  const localPath = join(import.meta.dir, "..", "yt-dlp");
  const localFile = Bun.file(localPath);
  if (await localFile.exists()) {
    return localPath;
  }
  return "yt-dlp";
})();

interface YtDlpVideoInfo {
  id: string;
  title: string;
  description: string;
  channel_id: string;
  channel: string;
  upload_date: string;
  webpage_url: string;
  thumbnail: string;
  duration: number;
  subtitles?: Record<string, Array<{ url: string; ext: string }>>;
  automatic_captions?: Record<string, Array<{ url: string; ext: string }>>;
}

// Module-level config for cookies
let cookiesConfig: Config["cookies"] = undefined;

export function setCookiesConfig(config: Config["cookies"]): void {
  cookiesConfig = config;
}

function getCookieArgs(): string[] {
  if (!cookiesConfig) return [];

  if (cookiesConfig.browser) {
    return ["--cookies-from-browser", cookiesConfig.browser];
  }

  if (cookiesConfig.file) {
    return ["--cookies", cookiesConfig.file];
  }

  return [];
}

// Rate limiting helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 5000; // 5 seconds between yt-dlp calls

async function runYtDlp(args: string[], allowPartialSuccess = false): Promise<string> {
  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await sleep(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  const cookieArgs = getCookieArgs();
  const fullArgs = [...cookieArgs, ...args];

  const proc = Bun.spawn([YT_DLP_PATH, ...fullArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  // If we got output, consider it a success even with warnings
  if (stdout.trim() && allowPartialSuccess) {
    return stdout;
  }

  if (exitCode !== 0) {
    // Check if it's just warnings vs actual errors
    const isRateLimited = stderr.includes("429") || stderr.includes("Too Many Requests");
    const hasRealError = stderr.includes("ERROR:");

    if (isRateLimited) {
      throw new Error(`Rate limited by YouTube. Try again later.`);
    }
    if (hasRealError && !stdout.trim()) {
      throw new Error(`yt-dlp failed: ${stderr}`);
    }
  }

  return stdout;
}

export async function fetchChannelInfo(channelUrl: string): Promise<Channel> {
  const url = validateChannelUrl(channelUrl);

  const output = await runYtDlp([
    "--dump-json",
    "--playlist-items",
    "1",
    "--flat-playlist",
    `${url}/videos`,
  ]);

  const lines = output.trim().split("\n");
  const info = JSON.parse(lines[0]);

  return {
    id: info.channel_id || info.id,
    name: info.channel || info.title,
    url: url,
  };
}

export async function fetchRecentVideos(
  channelUrl: string,
  maxVideos: number = 10
): Promise<Video[]> {
  const url = validateChannelUrl(channelUrl);

  console.log(`Fetching recent videos from ${url}...`);

  const output = await runYtDlp([
    "--dump-json",
    "--playlist-items",
    `1:${maxVideos}`,
    "--no-download",
    `${url}/videos`,
  ], true);

  const videos: Video[] = [];

  for (const line of output.trim().split("\n")) {
    if (!line) continue;

    try {
      const info: YtDlpVideoInfo = JSON.parse(line);

      // Parse upload_date (YYYYMMDD format)
      const dateStr = info.upload_date;
      const publishedAt = new Date(
        `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
      );

      videos.push({
        id: info.id,
        channelId: info.channel_id,
        channelName: info.channel,
        title: info.title,
        description: info.description || "",
        publishedAt,
        url: info.webpage_url,
        thumbnail: info.thumbnail,
        duration: info.duration,
        fetchedAt: new Date(),
      });
    } catch (e) {
      console.error("Failed to parse video info:", e);
    }
  }

  return videos;
}

export async function fetchTranscript(
  videoId: string,
  preferredLang: string = "en"
): Promise<string | null> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`Fetching transcript for ${videoId}...`);

  try {
    // First, get available subtitles info
    const infoOutput = await runYtDlp([
      "--dump-json",
      "--skip-download",
      videoUrl,
    ]);

    const info: YtDlpVideoInfo = JSON.parse(infoOutput);

    // Check if we have subtitles available
    const hasManualSubs = info.subtitles && Object.keys(info.subtitles).length > 0;
    const hasAutoSubs =
      info.automatic_captions && Object.keys(info.automatic_captions).length > 0;

    if (!hasManualSubs && !hasAutoSubs) {
      console.log(`No subtitles available for ${videoId}`);
      return null;
    }

    // Download subtitles to a temp file
    const tempDir = `/tmp/yt-transcript-${videoId}`;
    await Bun.spawn(["mkdir", "-p", tempDir]).exited;

    const subtitleArgs = [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      `${preferredLang}.*,${preferredLang}`,
      "--sub-format",
      "vtt",
      "--convert-subs",
      "vtt",
      "-o",
      `${tempDir}/%(id)s.%(ext)s`,
      videoUrl,
    ];

    await runYtDlp(subtitleArgs);

    // Read the subtitle file
    const files = await Array.fromAsync(
      new Bun.Glob(`${tempDir}/*.vtt`).scan()
    );

    if (files.length === 0) {
      console.log(`No subtitle file found for ${videoId}`);
      return null;
    }

    const subtitleContent = await Bun.file(files[0]).text();
    const transcript = parseVtt(subtitleContent);

    // Cleanup
    await Bun.spawn(["rm", "-rf", tempDir]).exited;

    return transcript;
  } catch (e) {
    console.error(`Failed to fetch transcript for ${videoId}:`, e);
    return null;
  }
}

function parseVtt(vttContent: string): string {
  const lines = vttContent.split("\n");
  const textLines: string[] = [];
  let lastLine = "";

  for (const line of lines) {
    // Skip metadata, timestamps, and empty lines
    if (
      line.startsWith("WEBVTT") ||
      line.startsWith("Kind:") ||
      line.startsWith("Language:") ||
      line.includes("-->") ||
      line.match(/^\d+$/) ||
      !line.trim()
    ) {
      continue;
    }

    // Clean up the line (remove VTT formatting tags)
    const cleanLine = line
      .replace(/<[^>]+>/g, "") // Remove HTML-like tags
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();

    // Avoid duplicates (auto-captions often repeat lines)
    if (cleanLine && cleanLine !== lastLine) {
      textLines.push(cleanLine);
      lastLine = cleanLine;
    }
  }

  return textLines.join(" ");
}
