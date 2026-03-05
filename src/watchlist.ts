import fs from "fs";
import path from "path";

const WATCHLIST_PATH = path.join(
  process.env.HOME ?? ".",
  "polymarket-agent",
  ".watchlist.json"
);

export interface WatchlistEntry {
  id: string;
  question: string;
  slug: string;
  addedAt: string;
  addedPrice: { yes: number; no: number };
  notes?: string;
}

interface WatchlistData {
  entries: WatchlistEntry[];
}

function load(): WatchlistData {
  try {
    const raw = fs.readFileSync(WATCHLIST_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { entries: [] };
  }
}

function save(data: WatchlistData) {
  fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(data, null, 2));
}

export function addToWatchlist(entry: WatchlistEntry): void {
  const data = load();
  // Don't add duplicates
  if (data.entries.some((e) => e.id === entry.id)) {
    // Update instead
    data.entries = data.entries.map((e) =>
      e.id === entry.id ? { ...e, ...entry } : e
    );
  } else {
    data.entries.push(entry);
  }
  save(data);
}

export function removeFromWatchlist(id: string): boolean {
  const data = load();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.id !== id);
  save(data);
  return data.entries.length < before;
}

export function getWatchlist(): WatchlistEntry[] {
  return load().entries;
}

export function clearWatchlist(): void {
  save({ entries: [] });
}
