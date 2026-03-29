import type { Video } from "./types";

const DATA_DIR = "./data";
const VIDEOS_FILE = `${DATA_DIR}/videos.json`;

interface StoredData {
  videos: Video[];
  lastUpdated: string;
}

export async function loadVideos(): Promise<Video[]> {
  const file = Bun.file(VIDEOS_FILE);

  if (!(await file.exists())) {
    return [];
  }

  try {
    const data: StoredData = await file.json();
    // Restore Date objects
    return data.videos.map((v) => ({
      ...v,
      publishedAt: new Date(v.publishedAt),
      fetchedAt: new Date(v.fetchedAt),
    }));
  } catch {
    return [];
  }
}

export async function saveVideos(videos: Video[]): Promise<void> {
  await Bun.spawn(["mkdir", "-p", DATA_DIR]).exited;

  const data: StoredData = {
    videos,
    lastUpdated: new Date().toISOString(),
  };

  await Bun.write(VIDEOS_FILE, JSON.stringify(data, null, 2));
}

export async function upsertVideos(newVideos: Video[]): Promise<Video[]> {
  const existing = await loadVideos();
  const existingIds = new Set(existing.map((v) => v.id));

  const merged = [...existing];

  for (const video of newVideos) {
    if (existingIds.has(video.id)) {
      // Update existing video (preserve transcript/summary if present)
      const idx = merged.findIndex((v) => v.id === video.id);
      if (idx !== -1) {
        merged[idx] = {
          ...video,
          transcript: merged[idx].transcript || video.transcript,
          summary: merged[idx].summary || video.summary,
        };
      }
    } else {
      merged.push(video);
    }
  }

  // Sort by publish date, newest first
  merged.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  await saveVideos(merged);
  return merged;
}

export async function updateVideoTranscript(
  videoId: string,
  transcript: string
): Promise<void> {
  const videos = await loadVideos();
  const idx = videos.findIndex((v) => v.id === videoId);

  if (idx !== -1) {
    videos[idx].transcript = transcript;
    await saveVideos(videos);
  }
}

export async function updateVideoSummary(
  videoId: string,
  summary: string
): Promise<void> {
  const videos = await loadVideos();
  const idx = videos.findIndex((v) => v.id === videoId);

  if (idx !== -1) {
    videos[idx].summary = summary;
    await saveVideos(videos);
  }
}

export async function getVideosByChannel(channelId: string): Promise<Video[]> {
  const videos = await loadVideos();
  return videos.filter((v) => v.channelId === channelId);
}

export async function getVideosWithoutTranscript(): Promise<Video[]> {
  const videos = await loadVideos();
  // undefined = not checked yet, "" = checked but not available
  return videos.filter((v) => v.transcript === undefined);
}

export async function markTranscriptUnavailable(videoId: string): Promise<void> {
  const videos = await loadVideos();
  const idx = videos.findIndex((v) => v.id === videoId);

  if (idx !== -1) {
    videos[idx].transcript = ""; // Empty string = checked but unavailable
    await saveVideos(videos);
  }
}

export async function getVideosWithoutSummary(): Promise<Video[]> {
  const videos = await loadVideos();
  return videos.filter((v) => v.transcript && !v.summary);
}
