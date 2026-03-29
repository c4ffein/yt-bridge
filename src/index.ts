import { Hono } from "hono";
import { loadConfig } from "./config";
import { fetchRecentVideos, fetchTranscript, setCookiesConfig } from "./fetcher";
import { generateSummaryFeed, generateTranscriptFeed, generateChannelFeed } from "./rss";
import {
  loadVideos,
  upsertVideos,
  updateVideoTranscript,
  updateVideoSummary,
  getVideosWithoutTranscript,
  getVideosWithoutSummary,
  getVideosByChannel,
  markTranscriptUnavailable,
} from "./storage";
import { summarizeTranscript } from "./summarizer";
import type { Config, Video } from "./types";

let config: Config;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function refreshVideos(): Promise<void> {
  console.log("Refreshing videos from all channels...");

  const existingVideos = await loadVideos();
  const existingIds = new Set(existingVideos.map((v) => v.id));

  for (const channel of config.channels) {
    try {
      const videos = await fetchRecentVideos(channel, config.maxVideosPerChannel);
      const newVideos = videos.filter((v) => !existingIds.has(v.id));

      if (newVideos.length > 0) {
        await upsertVideos(newVideos);
        console.log(`Found ${newVideos.length} new videos from ${channel}`);
      } else {
        console.log(`No new videos from ${channel}`);
      }

      // Sleep between channels to avoid rate limiting
      await sleep(5000);
    } catch (e) {
      console.error(`Failed to fetch from ${channel}:`, e);
      // On error, wait longer before next channel
      await sleep(10000);
    }
  }
}

async function processTranscripts(): Promise<void> {
  const videosWithoutTranscript = await getVideosWithoutTranscript();

  if (videosWithoutTranscript.length === 0) {
    console.log("All videos have transcripts");
    return;
  }

  console.log(`Processing ${Math.min(3, videosWithoutTranscript.length)} of ${videosWithoutTranscript.length} missing transcripts...`);

  // Only process 3 at a time to avoid rate limiting
  for (const video of videosWithoutTranscript.slice(0, 3)) {
    try {
      console.log(`Fetching transcript for: ${video.title}`);
      const transcript = await fetchTranscript(video.id);
      if (transcript) {
        await updateVideoTranscript(video.id, transcript);
        console.log(`✓ Got transcript (${transcript.length} chars)`);
      } else {
        await markTranscriptUnavailable(video.id);
        console.log(`✗ No transcript available (marked)`);
      }
    } catch (e) {
      console.error(`✗ Failed:`, e instanceof Error ? e.message : e);
    }

    // Sleep between transcript fetches
    await sleep(8000);
  }
}

async function processSummaries(): Promise<void> {
  if (!config.summarizer) {
    return;
  }

  console.log("Processing missing summaries...");

  const videosWithoutSummary = await getVideosWithoutSummary();

  for (const video of videosWithoutSummary.slice(0, 5)) {
    // Process 5 at a time
    if (!video.transcript) continue;

    try {
      const summary = await summarizeTranscript(video.transcript, config.summarizer);
      if (summary) {
        await updateVideoSummary(video.id, summary);
        console.log(`Generated summary for: ${video.title}`);
      }
    } catch (e) {
      console.error(`Failed to summarize ${video.id}:`, e);
    }
  }
}

async function runScheduledTasks(): Promise<void> {
  await refreshVideos();
  await processTranscripts();
  await processSummaries();
}

function startScheduler(): void {
  const intervalMs = config.pollIntervalMinutes * 60 * 1000;

  console.log(`Scheduler started, polling every ${config.pollIntervalMinutes} minutes`);

  // Run immediately on start
  runScheduledTasks().catch(console.error);

  // Then run periodically
  setInterval(() => {
    runScheduledTasks().catch(console.error);
  }, intervalMs);
}

function createServer(): Hono {
  const app = new Hono();

  // Health check
  app.get("/health", (c) => c.json({ status: "ok" }));

  // List all videos (JSON)
  app.get("/api/videos", async (c) => {
    const videos = await loadVideos();
    return c.json(videos);
  });

  // Trigger manual refresh
  app.post("/api/refresh", async (c) => {
    runScheduledTasks().catch(console.error);
    return c.json({ status: "refresh started" });
  });

  // RSS feed with summaries (all channels)
  app.get("/feed/summary", async (c) => {
    const videos = await loadVideos();
    const baseUrl = `http://${config.server.host}:${config.server.port}`;

    const feed = generateSummaryFeed(videos, {
      title: "YT Bridge - Summaries",
      description: "Video summaries from your subscribed channels",
      feedUrl: `${baseUrl}/feed/summary`,
      siteUrl: baseUrl,
    });

    return c.body(feed, 200, { "Content-Type": "application/rss+xml" });
  });

  // RSS feed with full transcripts (all channels)
  app.get("/feed/transcript", async (c) => {
    const videos = await loadVideos();
    const baseUrl = `http://${config.server.host}:${config.server.port}`;

    const feed = generateTranscriptFeed(videos, {
      title: "YT Bridge - Full Transcripts",
      description: "Full video transcripts from your subscribed channels",
      feedUrl: `${baseUrl}/feed/transcript`,
      siteUrl: baseUrl,
    });

    return c.body(feed, 200, { "Content-Type": "application/rss+xml" });
  });

  // Per-channel RSS feed with summaries
  app.get("/feed/channel/:channelId/summary", async (c) => {
    const channelId = c.req.param("channelId");
    const videos = await getVideosByChannel(channelId);
    const baseUrl = `http://${config.server.host}:${config.server.port}`;

    if (videos.length === 0) {
      return c.json({ error: "Channel not found or no videos" }, 404);
    }

    const channelName = videos[0].channelName;
    const feed = generateChannelFeed(channelName, videos, {
      feedUrl: `${baseUrl}/feed/channel/${channelId}/summary`,
      siteUrl: baseUrl,
    });

    return c.body(feed, 200, { "Content-Type": "application/rss+xml" });
  });

  // Per-channel RSS feed with transcripts
  app.get("/feed/channel/:channelId/transcript", async (c) => {
    const channelId = c.req.param("channelId");
    const videos = await getVideosByChannel(channelId);
    const baseUrl = `http://${config.server.host}:${config.server.port}`;

    if (videos.length === 0) {
      return c.json({ error: "Channel not found or no videos" }, 404);
    }

    const channelName = videos[0].channelName;
    const feed = generateChannelFeed(
      channelName,
      videos,
      {
        feedUrl: `${baseUrl}/feed/channel/${channelId}/transcript`,
        siteUrl: baseUrl,
      },
      true
    );

    return c.body(feed, 200, { "Content-Type": "application/rss+xml" });
  });

  // Index page
  app.get("/", async (c) => {
    const videos = await loadVideos();
    const channels = [...new Set(videos.map((v) => ({ id: v.channelId, name: v.channelName })))];
    const baseUrl = `http://${config.server.host}:${config.server.port}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>YT Bridge</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    h1 { color: #cc0000; }
    a { color: #065fd4; }
    ul { line-height: 1.8; }
    .stats { background: #f0f0f0; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
  </style>
</head>
<body>
  <h1>📺 YT Bridge</h1>

  <div class="stats">
    <strong>Stats:</strong> ${videos.length} videos from ${channels.length} channels
  </div>

  <h2>Global Feeds</h2>
  <ul>
    <li><a href="/feed/summary">RSS - All Summaries</a></li>
    <li><a href="/feed/transcript">RSS - All Transcripts</a></li>
  </ul>

  <h2>Channel Feeds</h2>
  <ul>
    ${channels
      .map(
        (ch) => `
      <li>
        <strong>${ch.name}</strong>
        - <a href="/feed/channel/${ch.id}/summary">Summary</a>
        - <a href="/feed/channel/${ch.id}/transcript">Transcript</a>
      </li>
    `
      )
      .join("")}
  </ul>

  <h2>API</h2>
  <ul>
    <li><a href="/api/videos">GET /api/videos</a> - List all videos (JSON)</li>
    <li>POST /api/refresh - Trigger manual refresh</li>
    <li><a href="/health">GET /health</a> - Health check</li>
  </ul>
</body>
</html>
    `.trim();

    return c.html(html);
  });

  return app;
}

async function main(): Promise<void> {
  console.log("YT Bridge starting...");

  // Load config
  const configPath = process.argv[2] || "config.yaml";
  config = await loadConfig(configPath);

  console.log(`Loaded config with ${config.channels.length} channels`);

  // Set up cookies for yt-dlp
  if (config.cookies) {
    setCookiesConfig(config.cookies);
    console.log(`Cookies configured: ${config.cookies.browser ? `browser=${config.cookies.browser}` : `file=${config.cookies.file}`}`);
  }

  // Start scheduler
  startScheduler();

  // Start web server
  const app = createServer();

  console.log(`Server starting on http://${config.server.host}:${config.server.port}`);

  Bun.serve({
    fetch: app.fetch,
    port: config.server.port,
    hostname: config.server.host,
  });
}

main().catch(console.error);
