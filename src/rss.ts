import RSS from "rss";
import type { Video } from "./types";

interface FeedOptions {
  title: string;
  description: string;
  feedUrl: string;
  siteUrl: string;
}

export function generateSummaryFeed(videos: Video[], options: FeedOptions): string {
  const feed = new RSS({
    title: options.title,
    description: options.description,
    feed_url: options.feedUrl,
    site_url: options.siteUrl,
    language: "en",
    pubDate: new Date(),
  });

  for (const video of videos) {
    const content = video.summary
      ? `<h2>Summary</h2><p>${escapeHtml(video.summary)}</p>`
      : `<p><em>Summary not yet available</em></p>`;

    feed.item({
      title: video.title,
      description: content,
      url: video.url,
      guid: video.id,
      categories: [video.channelName],
      author: video.channelName,
      date: video.publishedAt,
      enclosure: {
        url: video.thumbnail,
        type: "image/jpeg",
      },
      custom_elements: [
        { "media:thumbnail": { _attr: { url: video.thumbnail } } },
        { duration: formatDuration(video.duration) },
        { channelId: video.channelId },
      ],
    });
  }

  return feed.xml({ indent: true });
}

export function generateTranscriptFeed(videos: Video[], options: FeedOptions): string {
  const feed = new RSS({
    title: options.title,
    description: options.description,
    feed_url: options.feedUrl,
    site_url: options.siteUrl,
    language: "en",
    pubDate: new Date(),
  });

  for (const video of videos) {
    let content = `<h2>${escapeHtml(video.title)}</h2>`;
    content += `<p><strong>Channel:</strong> ${escapeHtml(video.channelName)}</p>`;
    content += `<p><strong>Duration:</strong> ${formatDuration(video.duration)}</p>`;
    content += `<p><a href="${video.url}">Watch on YT</a></p>`;

    if (video.summary) {
      content += `<h3>Summary</h3><p>${escapeHtml(video.summary)}</p>`;
    }

    if (video.transcript) {
      content += `<h3>Full Transcript</h3>`;
      content += `<div style="white-space: pre-wrap;">${escapeHtml(video.transcript)}</div>`;
    } else {
      content += `<p><em>Transcript not available</em></p>`;
    }

    feed.item({
      title: video.title,
      description: content,
      url: video.url,
      guid: `${video.id}-transcript`,
      categories: [video.channelName],
      author: video.channelName,
      date: video.publishedAt,
      enclosure: {
        url: video.thumbnail,
        type: "image/jpeg",
      },
    });
  }

  return feed.xml({ indent: true });
}

export function generateChannelFeed(
  channelName: string,
  videos: Video[],
  options: Omit<FeedOptions, "title" | "description">,
  includeTranscript: boolean = false
): string {
  const feedOptions: FeedOptions = {
    ...options,
    title: `${channelName} - YT Bridge`,
    description: `Videos from ${channelName}`,
  };

  return includeTranscript
    ? generateTranscriptFeed(videos, feedOptions)
    : generateSummaryFeed(videos, feedOptions);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
