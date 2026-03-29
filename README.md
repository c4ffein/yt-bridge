# YT Bridge

> **Work in progress** — This project is under active development and not yet part of my personal workflow. Expect rough edges.

Turn YT channels into readable RSS feeds with transcripts and summaries.

## Requirements

- [Bun](https://bun.sh) runtime
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed and in PATH

## Setup

```bash
# Install dependencies
bun install

# Copy and edit config
cp config.example.yaml config.yaml
# Edit config.yaml with your channels

# Run
bun start
```

## Configuration

Edit `config.yaml`:

```yaml
channels:
  - "@3blue1brown"
  - "@Fireship"

pollIntervalMinutes: 60
maxVideosPerChannel: 10

server:
  port: 3000
  host: localhost

# Optional: enable AI summaries
summarizer:
  provider: ollama  # or openai, anthropic
  model: llama3.2
```

## Feeds

Once running, access:

- `http://localhost:3000/` - Web UI with all feeds
- `http://localhost:3000/feed/summary` - RSS with summaries
- `http://localhost:3000/feed/transcript` - RSS with full transcripts
- `http://localhost:3000/feed/channel/:id/summary` - Per-channel summary
- `http://localhost:3000/feed/channel/:id/transcript` - Per-channel transcript

## API

- `GET /api/videos` - All videos as JSON
- `POST /api/refresh` - Trigger manual refresh
- `GET /health` - Health check

## TODO / Improvements

- **Testing** — Add unit tests for VTT parsing and config validation
- **Storage** — Migrate from JSON file to SQLite (Bun has built-in support)
- **Error handling** — Add exponential backoff when YouTube rate-limits requests
- **Code cleanup** — `fetchChannelInfo()` in `fetcher.ts` appears unused
- **Observability** — Replace `console.log` with structured logging
- **Configuration** — Make hardcoded values (15K char truncation, `/tmp` paths) configurable; validate that `apiKey` is present when a summarizer provider is set

## License

MIT
