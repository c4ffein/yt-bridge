#!/usr/bin/env bun
/**
 * Convert Chrome DevTools cookie export to Netscape cookies.txt format
 *
 * Usage:
 *   1. Open DevTools → Application → Cookies → youtube.com (and google.com)
 *   2. Select all cookies (Ctrl+A), copy (Ctrl+C)
 *   3. Run: bun scripts/convert-cookies.ts < paste.txt > cookies.txt
 *   Or:   pbpaste | bun scripts/convert-cookies.ts > cookies.txt  (macOS)
 *   Or:   xclip -o | bun scripts/convert-cookies.ts > cookies.txt (Linux)
 */

const input = await Bun.stdin.text();

const lines = input.trim().split('\n');
const cookies: string[] = ['# Netscape HTTP Cookie File', '# https://curl.haxx.se/rfc/cookie_spec.html', ''];

for (const line of lines) {
  // Chrome DevTools format (tab-separated):
  // Name, Value, Domain, Path, Expires, Size, HttpOnly, Secure, SameSite, ...
  const parts = line.split('\t');

  if (parts.length < 5) continue;

  const name = parts[0]?.trim();
  const value = parts[1]?.trim();
  const domain = parts[2]?.trim();
  const path = parts[3]?.trim() || '/';
  const expiresStr = parts[4]?.trim();
  const httpOnly = line.toLowerCase().includes('✓') && parts[6]?.includes('✓');
  const secure = parts[7]?.includes('✓') || domain?.includes('google') || domain?.includes('youtube');

  if (!name || !value || !domain) continue;

  // Parse expiry date to Unix timestamp
  let expiry = '0';
  if (expiresStr && expiresStr !== 'Session') {
    try {
      const date = new Date(expiresStr);
      if (!isNaN(date.getTime())) {
        expiry = Math.floor(date.getTime() / 1000).toString();
      }
    } catch {
      expiry = '0';
    }
  }

  // Netscape format: domain, includeSubdomains, path, secure, expiry, name, value
  const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
  const secureFlag = secure ? 'TRUE' : 'FALSE';

  cookies.push(`${domain}\t${includeSubdomains}\t${path}\t${secureFlag}\t${expiry}\t${name}\t${value}`);
}

console.log(cookies.join('\n'));
