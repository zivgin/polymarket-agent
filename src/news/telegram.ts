import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import type { NewsItem } from "../types/index.js";

const execFileAsync = promisify(execFile);

// Path to the telegram skill's script
const TELEGRAM_SCRIPT = path.join(
  process.env.HOME ?? "~",
  ".agents/skills/telegram/scripts/telegram_fetch.py"
);

export async function fetchTelegramChannel(
  channelName: string,
  limit = 20
): Promise<NewsItem[]> {
  try {
    const { stdout } = await execFileAsync("python3", [
      TELEGRAM_SCRIPT,
      "recent",
      "--chat",
      channelName,
      "--limit",
      String(limit),
      "--json",
    ], { timeout: 30_000 });

    const data = JSON.parse(stdout);
    const messages = data.messages ?? data ?? [];

    return messages
      .filter((m: any) => m.text && m.text.length > 20)
      .map((m: any) => ({
        id: `tg-${channelName}-${m.id ?? m.message_id ?? Date.now()}`,
        title: extractTitle(m.text),
        summary: m.text.slice(0, 500),
        source: { type: "telegram" as const, channel: channelName },
        url: undefined,
        publishedAt: m.date ? new Date(m.date) : new Date(),
        keywords: extractKeywordsSimple(m.text),
        rawContent: m.text,
      }));
  } catch (err: any) {
    // Telegram not configured or channel not accessible - fail silently
    console.error(`[telegram] Failed to fetch ${channelName}: ${err.message}`);
    return [];
  }
}

export async function fetchAllTelegramChannels(
  channels: string[],
  limit = 20
): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    channels.map((ch) => fetchTelegramChannel(ch, limit))
  );

  const items: NewsItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    }
  }

  return items.sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );
}

export async function isTelegramConfigured(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("python3", [
      TELEGRAM_SCRIPT,
      "setup",
    ], { timeout: 10_000 });
    return stdout.includes("configured") || stdout.includes("ready");
  } catch {
    return false;
  }
}

function extractTitle(text: string): string {
  // First line or first sentence as title
  const firstLine = text.split("\n")[0].trim();
  if (firstLine.length <= 120) return firstLine;
  const firstSentence = text.match(/^[^.!?]+[.!?]/)?.[0] ?? "";
  if (firstSentence.length <= 120) return firstSentence;
  return firstLine.slice(0, 117) + "...";
}

function extractKeywordsSimple(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}
