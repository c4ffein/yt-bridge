# YT Bridge

RSS bridge for YT channels with transcript extraction and AI summaries.

## Stack

- Bun runtime
- Hono web framework
- yt-dlp for video/transcript fetching
- Zod for config validation

## Commands

```bash
bun start         # Run the server
bun dev           # Run with watch mode
bun install       # Install dependencies
```

## Project Structure

```
src/
  index.ts        # Main entry, server + scheduler
  config.ts       # Config loading/validation
  fetcher.ts      # yt-dlp wrapper for videos/transcripts
  rss.ts          # RSS feed generation
  storage.ts      # JSON file storage
  summarizer.ts   # LLM integration (OpenAI/Anthropic/Ollama)
  types.ts        # TypeScript types
data/
  videos.json     # Stored videos (auto-created)
config.yaml       # User config (copy from config.example.yaml)
```

## Testing

Requires yt-dlp in PATH. Create a test config:

```bash
cp config.example.yaml config.yaml
bun start
# Visit http://localhost:3000
```
