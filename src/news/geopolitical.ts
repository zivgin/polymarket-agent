// ── Geopolitical & Natural Event Data Sources ──
// Free APIs: GDELT, USGS Earthquakes, NASA EONET, GDACS

import axios from "axios";
import type { NewsItem } from "../types/index.js";

// ── GDELT: Global Database of Events, Language, and Tone ──

const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";

export interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

export interface GdeltTimelinePoint {
  date: string;
  value: number;
}

export async function fetchGdeltArticles(
  query: string,
  maxRecords = 30
): Promise<NewsItem[]> {
  try {
    const { data } = await axios.get(GDELT_DOC_API, {
      params: {
        query,
        mode: "artlist",
        maxrecords: maxRecords,
        format: "json",
      },
      timeout: 10_000,
    });

    const articles: GdeltArticle[] = data?.articles ?? [];
    return articles.map((a) => ({
      id: `gdelt_${a.seendate}_${a.domain}`,
      title: a.title ?? "",
      summary: `Source: ${a.domain} (${a.sourcecountry})`,
      source: { type: "web" as const, site: `GDELT/${a.domain}` },
      url: a.url,
      publishedAt: parseGdeltDate(a.seendate),
      keywords: extractKeywords(a.title),
    }));
  } catch {
    return [];
  }
}

export async function fetchGdeltTimeline(
  query: string,
  days = 7
): Promise<GdeltTimelinePoint[]> {
  try {
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 3_600_000);
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);

    const { data } = await axios.get(GDELT_DOC_API, {
      params: {
        query,
        mode: "timelinevol",
        format: "json",
        startdatetime: fmt(start),
        enddatetime: fmt(now),
      },
      timeout: 10_000,
    });

    const timeline = data?.timeline?.[0]?.data ?? [];
    return timeline.map((d: any) => ({
      date: d.date,
      value: d.value,
    }));
  } catch {
    return [];
  }
}

function parseGdeltDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  // Format: "20260307T070000Z"
  try {
    const y = dateStr.slice(0, 4);
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    const h = dateStr.slice(9, 11);
    const min = dateStr.slice(11, 13);
    return new Date(`${y}-${m}-${d}T${h}:${min}:00Z`);
  } catch {
    return new Date();
  }
}

// ── USGS Earthquakes ──

const USGS_SIGNIFICANT_WEEK = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson";
const USGS_45_DAY = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";

export interface EarthquakeEvent {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  alert: string | null; // green/yellow/orange/red
  tsunami: number;
  significance: number;
  title: string;
  coordinates: [number, number, number];
}

export async function fetchEarthquakes(
  significantOnly = false
): Promise<EarthquakeEvent[]> {
  try {
    const url = significantOnly ? USGS_SIGNIFICANT_WEEK : USGS_45_DAY;
    const { data } = await axios.get(url, { timeout: 10_000 });

    return (data?.features ?? []).map((f: any) => ({
      id: f.id ?? "",
      magnitude: f.properties?.mag ?? 0,
      place: f.properties?.place ?? "",
      time: f.properties?.time ?? 0,
      alert: f.properties?.alert ?? null,
      tsunami: f.properties?.tsunami ?? 0,
      significance: f.properties?.sig ?? 0,
      title: f.properties?.title ?? "",
      coordinates: f.geometry?.coordinates ?? [0, 0, 0],
    }));
  } catch {
    return [];
  }
}

export function earthquakesToNewsItems(quakes: EarthquakeEvent[]): NewsItem[] {
  return quakes.map((q) => {
    const alertTag = q.alert ? ` [PAGER: ${q.alert.toUpperCase()}]` : "";
    const tsunamiTag = q.tsunami ? " [TSUNAMI WARNING]" : "";
    return {
      id: `usgs_${q.id}`,
      title: `${q.title}${alertTag}${tsunamiTag}`,
      summary: `Magnitude ${q.magnitude} earthquake at ${q.place}. Significance: ${q.significance}/1000.${q.tsunami ? " Tsunami warning issued." : ""}`,
      source: { type: "web" as const, site: "USGS" },
      url: `https://earthquake.usgs.gov/earthquakes/eventpage/${q.id}`,
      publishedAt: new Date(q.time),
      keywords: ["earthquake", "seismic", q.place.split(",").pop()?.trim() ?? ""].filter(Boolean),
    };
  });
}

// ── NASA EONET: Earth Observatory Natural Event Tracker ──

const EONET_API = "https://eonet.gsfc.nasa.gov/api/v3/events";

export interface EonetEvent {
  id: string;
  title: string;
  categories: Array<{ id: string; title: string }>;
  closed: string | null;
  geometry: Array<{ magnitudeValue: number | null; magnitudeUnit: string | null; date: string; coordinates: number[] }>;
}

export async function fetchEonetEvents(
  opts?: { category?: string; days?: number; limit?: number }
): Promise<EonetEvent[]> {
  try {
    const params: Record<string, any> = {
      status: "open",
      limit: opts?.limit ?? 30,
    };
    if (opts?.category) params.category = opts.category;
    if (opts?.days) params.days = opts.days;

    const { data } = await axios.get(EONET_API, { params, timeout: 10_000 });
    return (data?.events ?? []).map((e: any) => ({
      id: e.id ?? "",
      title: e.title ?? "",
      categories: e.categories ?? [],
      closed: e.closed,
      geometry: e.geometry ?? [],
    }));
  } catch {
    return [];
  }
}

export function eonetToNewsItems(events: EonetEvent[]): NewsItem[] {
  return events.map((e) => {
    const category = e.categories[0]?.title ?? "Natural Event";
    const latest = e.geometry[e.geometry.length - 1];
    const magnitude = latest?.magnitudeValue
      ? ` (${latest.magnitudeValue} ${latest.magnitudeUnit ?? ""})`
      : "";

    return {
      id: `eonet_${e.id}`,
      title: `[${category}] ${e.title}${magnitude}`,
      summary: `Active ${category.toLowerCase()} event tracked by NASA. ${e.geometry.length} observation(s).`,
      source: { type: "web" as const, site: "NASA/EONET" },
      url: `https://eonet.gsfc.nasa.gov/api/v3/events/${e.id}`,
      publishedAt: latest?.date ? new Date(latest.date) : new Date(),
      keywords: [category.toLowerCase(), "natural disaster", "nasa"].filter(Boolean),
    };
  });
}

// ── GDACS: Global Disaster Alert and Coordination System ──

const GDACS_API = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";

export interface GdacsEvent {
  eventType: string;
  eventId: number;
  name: string;
  alertLevel: string; // Green/Orange/Red
  alertScore: number;
  country: string;
  fromDate: string;
  severity: number;
  severityText: string;
  affectedCountries: string[];
  coordinates: [number, number];
}

export async function fetchGdacsEvents(
  opts?: { alertLevel?: string; eventTypes?: string }
): Promise<GdacsEvent[]> {
  try {
    const params: Record<string, string> = {
      eventlist: opts?.eventTypes ?? "EQ,TC,FL,VO,WF,DR",
      alertlevel: opts?.alertLevel ?? "Green;Orange;Red",
    };

    const { data } = await axios.get(GDACS_API, {
      params,
      timeout: 10_000,
    });

    return (data?.features ?? []).map((f: any) => ({
      eventType: f.properties?.eventtype ?? "",
      eventId: f.properties?.eventid ?? 0,
      name: f.properties?.name ?? "",
      alertLevel: f.properties?.alertlevel ?? "Green",
      alertScore: f.properties?.alertscore ?? 0,
      country: f.properties?.country ?? "",
      fromDate: f.properties?.fromdate ?? "",
      severity: f.properties?.severitydata?.severity ?? 0,
      severityText: f.properties?.severitydata?.severitytext ?? "",
      affectedCountries: (f.properties?.affectedcountries ?? []).map((c: any) => c.countryname),
      coordinates: f.geometry?.coordinates ?? [0, 0],
    }));
  } catch {
    return [];
  }
}

export function gdacsToNewsItems(events: GdacsEvent[]): NewsItem[] {
  const typeLabels: Record<string, string> = {
    EQ: "Earthquake",
    TC: "Tropical Cyclone",
    FL: "Flood",
    VO: "Volcano",
    WF: "Wildfire",
    DR: "Drought",
  };

  return events.map((e) => {
    const typeLabel = typeLabels[e.eventType] ?? e.eventType;
    const alertEmoji = e.alertLevel === "Red" ? "[RED ALERT]" : e.alertLevel === "Orange" ? "[ORANGE ALERT]" : "";

    return {
      id: `gdacs_${e.eventType}_${e.eventId}`,
      title: `${alertEmoji} ${typeLabel}: ${e.name}`.trim(),
      summary: `${e.severityText}. Alert level: ${e.alertLevel}. Affected: ${e.affectedCountries.slice(0, 5).join(", ") || e.country}.`,
      source: { type: "web" as const, site: "GDACS" },
      url: `https://www.gdacs.org/report.aspx?eventtype=${e.eventType}&eventid=${e.eventId}`,
      publishedAt: new Date(e.fromDate),
      keywords: [typeLabel.toLowerCase(), e.country.toLowerCase(), "disaster", "alert"].filter(Boolean),
    };
  });
}

// ── Unified fetch: all geopolitical sources ──

export async function fetchAllGeopoliticalEvents(): Promise<NewsItem[]> {
  const [earthquakes, eonet, gdacs] = await Promise.allSettled([
    fetchEarthquakes().then(earthquakesToNewsItems),
    fetchEonetEvents({ days: 7 }).then(eonetToNewsItems),
    fetchGdacsEvents({ alertLevel: "Orange;Red" }).then(gdacsToNewsItems),
  ]);

  const items: NewsItem[] = [];
  if (earthquakes.status === "fulfilled") items.push(...earthquakes.value);
  if (eonet.status === "fulfilled") items.push(...eonet.value);
  if (gdacs.status === "fulfilled") items.push(...gdacs.value);

  // Sort newest first
  items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return items;
}

// ── Utility ──

function extractKeywords(text: string): string[] {
  if (!text) return [];
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "is", "it", "that", "this", "was", "are", "be", "has", "had",
    "with", "from", "by", "as", "not", "will", "can", "may", "its",
    "been", "have", "their", "would", "could", "should", "about", "into",
    "than", "been", "said", "says", "new", "also", "more", "after",
  ]);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
  const freq = new Map<string, number>();
  for (const w of words) {
    if (w.length < 3 || stopWords.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}
