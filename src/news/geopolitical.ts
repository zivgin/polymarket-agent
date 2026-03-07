// ── Geopolitical & Natural Event Data Sources ──
// Free APIs: GDELT, USGS Earthquakes, NASA EONET, GDACS

import axios from "axios";
import type { NewsItem } from "../types/index.js";

// ── GDELT: Global Database of Events, Language, and Tone ──

const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_GEO_API = "https://api.gdeltproject.org/api/v2/geo/geo";
const GDELT_TV_API = "https://api.gdeltproject.org/api/v2/tv/tv";

// Structured theme codes for prediction-market-relevant topics
export const GDELT_THEMES = {
  elections: "ELECTION",
  protests: "PROTEST",
  terror: "TERROR",
  armedConflict: "ARMEDCONFLICT",
  militaryForce: "MILITARY",
  ceasefires: "CEASEFIRE",
  negotiations: "NEGOTIATE",
  sanctions: "ECON_SANCTIONS",
  crisisEscalation: "CRISISLEX_T03_DEAD",
  pandemic: "HEALTH_PANDEMIC",
  nuclearWeapons: "WMD_NUCLEAR",
  coupAttempt: "TAX_POLITICAL_PARTY_OVERTHROW",
  naturalDisaster: "NATURAL_DISASTER",
  economicCrisis: "ECON_BANKRUPTCY",
  tradeWar: "ECON_TRADE_DISPUTE",
} as const;

export type GdeltThemeKey = keyof typeof GDELT_THEMES;

export interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  sourcecountry: string;
  tone?: number;
}

export interface GdeltTimelinePoint {
  date: string;
  value: number;
}

export interface GdeltToneResult {
  query: string;
  avgTone: number;      // negative = negative sentiment, positive = positive
  toneTimeline: GdeltTimelinePoint[];
}

export interface GdeltGeoCluster {
  lat: number;
  lon: number;
  count: number;
  points: Array<{ url: string; name: string; lat: number; lon: number }>;
}

export async function fetchGdeltArticles(
  query: string,
  maxRecords = 30,
  opts?: { sourcelang?: string; sourcecountry?: string; theme?: string; toneAbove?: number; toneBelow?: number; near?: string; repeat?: string }
): Promise<NewsItem[]> {
  try {
    // Build advanced query string
    let q = query;
    if (opts?.sourcelang) q += ` sourcelang:${opts.sourcelang}`;
    if (opts?.sourcecountry) q += ` sourcecountry:${opts.sourcecountry}`;
    if (opts?.theme) q += ` theme:${opts.theme}`;
    if (opts?.toneAbove !== undefined) q += ` tone>${opts.toneAbove}`;
    if (opts?.toneBelow !== undefined) q += ` tone<${opts.toneBelow}`;
    if (opts?.near) q += ` near${opts.near}`; // e.g. "10:war conflict"
    if (opts?.repeat) q += ` repeat${opts.repeat}`; // e.g. "5:sanctions"

    const { data } = await axios.get(GDELT_DOC_API, {
      params: {
        query: q,
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
      summary: `Source: ${a.domain} (${a.sourcecountry})${a.tone !== undefined ? ` | Tone: ${a.tone > 0 ? "+" : ""}${a.tone.toFixed(1)}` : ""}`,
      source: { type: "web" as const, site: `GDELT/${a.domain}` },
      url: a.url,
      publishedAt: parseGdeltDate(a.seendate),
      keywords: extractKeywords(a.title),
    }));
  } catch {
    return [];
  }
}

// Fetch articles for a specific GDELT theme code
export async function fetchGdeltByTheme(
  themeKey: GdeltThemeKey,
  maxRecords = 20,
  opts?: { sourcelang?: string }
): Promise<NewsItem[]> {
  const theme = GDELT_THEMES[themeKey];
  return fetchGdeltArticles("", maxRecords, { theme, ...opts });
}

// Fetch GDELT tone analysis — measures global media sentiment on a topic
export async function fetchGdeltTone(
  query: string,
  days = 7
): Promise<GdeltToneResult> {
  try {
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 3_600_000);
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);

    const { data } = await axios.get(GDELT_DOC_API, {
      params: {
        query,
        mode: "timelinetone",
        format: "json",
        startdatetime: fmt(start),
        enddatetime: fmt(now),
      },
      timeout: 10_000,
    });

    const timeline = data?.timeline?.[0]?.data ?? [];
    const points: GdeltTimelinePoint[] = timeline.map((d: any) => ({
      date: d.date,
      value: d.value,
    }));

    const avgTone = points.length > 0
      ? points.reduce((s, p) => s + p.value, 0) / points.length
      : 0;

    return { query, avgTone, toneTimeline: points };
  } catch {
    return { query, avgTone: 0, toneTimeline: [] };
  }
}

// Geographic clustering — where is this topic being discussed most?
export async function fetchGdeltGeo(
  query: string,
  opts?: { sourcelang?: string; theme?: string }
): Promise<GdeltGeoCluster[]> {
  try {
    let q = query;
    if (opts?.sourcelang) q += ` sourcelang:${opts.sourcelang}`;
    if (opts?.theme) q += ` theme:${opts.theme}`;

    const { data } = await axios.get(GDELT_GEO_API, {
      params: {
        query: q,
        format: "GeoJSON",
      },
      timeout: 10_000,
    });

    return (data?.features ?? []).map((f: any) => ({
      lat: f.geometry?.coordinates?.[1] ?? 0,
      lon: f.geometry?.coordinates?.[0] ?? 0,
      count: f.properties?.count ?? 1,
      points: (f.properties?.points ?? []).map((p: any) => ({
        url: p.url ?? "",
        name: p.name ?? "",
        lat: p.lat ?? 0,
        lon: p.lon ?? 0,
      })),
    }));
  } catch {
    return [];
  }
}

// TV broadcast monitoring — tracks topic mentions on US cable news
export async function fetchGdeltTvMentions(
  query: string,
  mode: "timelinevol" | "stationdetail" = "timelinevol"
): Promise<{ stations?: Record<string, number>; timeline?: GdeltTimelinePoint[] }> {
  try {
    const { data } = await axios.get(GDELT_TV_API, {
      params: {
        query,
        mode,
        format: "json",
        last24: "yes",
      },
      timeout: 10_000,
    });

    if (mode === "stationdetail") {
      const stations: Record<string, number> = {};
      for (const s of data?.station_details ?? []) {
        stations[s.station ?? "unknown"] = s.value ?? 0;
      }
      return { stations };
    }

    const timeline = (data?.timeline?.[0]?.data ?? []).map((d: any) => ({
      date: d.date,
      value: d.value,
    }));
    return { timeline };
  } catch {
    return {};
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
const USGS_SIGNIFICANT_MONTH = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson";
const USGS_QUERY_API = "https://earthquake.usgs.gov/fdsnws/event/1/query";

export interface EarthquakeEvent {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  alert: string | null; // green/yellow/orange/red
  tsunami: number;
  significance: number;
  title: string;
  felt: number | null;   // number of "felt" reports
  mmi: number | null;    // ShakeMap max intensity
  coordinates: [number, number, number];
}

export async function fetchEarthquakes(
  opts?: { significantOnly?: boolean; minMagnitude?: number; alertLevel?: string; tsunamiOnly?: boolean; minSignificance?: number }
): Promise<EarthquakeEvent[]> {
  try {
    // Use query API for advanced filters, feed API for simple fetches
    if (opts?.minMagnitude || opts?.alertLevel || opts?.tsunamiOnly || opts?.minSignificance) {
      return fetchEarthquakesAdvanced(opts);
    }

    const url = opts?.significantOnly ? USGS_SIGNIFICANT_WEEK : USGS_45_DAY;
    const { data } = await axios.get(url, { timeout: 10_000 });

    return parseEarthquakeFeatures(data?.features ?? []);
  } catch {
    return [];
  }
}

async function fetchEarthquakesAdvanced(
  opts: { minMagnitude?: number; alertLevel?: string; tsunamiOnly?: boolean; minSignificance?: number }
): Promise<EarthquakeEvent[]> {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3_600_000);

    const params: Record<string, any> = {
      format: "geojson",
      starttime: weekAgo.toISOString().split("T")[0],
      endtime: now.toISOString().split("T")[0],
      orderby: "magnitude",
    };

    if (opts.minMagnitude) params.minmagnitude = opts.minMagnitude;
    if (opts.alertLevel) params.alertlevel = opts.alertLevel;
    if (opts.minSignificance) params.minsig = opts.minSignificance;

    const { data } = await axios.get(USGS_QUERY_API, { params, timeout: 10_000 });
    let quakes = parseEarthquakeFeatures(data?.features ?? []);

    if (opts.tsunamiOnly) {
      quakes = quakes.filter((q) => q.tsunami > 0);
    }

    return quakes;
  } catch {
    return [];
  }
}

function parseEarthquakeFeatures(features: any[]): EarthquakeEvent[] {
  return features.map((f: any) => ({
    id: f.id ?? "",
    magnitude: f.properties?.mag ?? 0,
    place: f.properties?.place ?? "",
    time: f.properties?.time ?? 0,
    alert: f.properties?.alert ?? null,
    tsunami: f.properties?.tsunami ?? 0,
    significance: f.properties?.sig ?? 0,
    title: f.properties?.title ?? "",
    felt: f.properties?.felt ?? null,
    mmi: f.properties?.mmi ?? null,
    coordinates: f.geometry?.coordinates ?? [0, 0, 0],
  }));
}

// Fetch only market-moving quakes (high significance, alerts, or tsunami)
export async function fetchHighSignalQuakes(): Promise<EarthquakeEvent[]> {
  const [significant, alertQuakes, tsunamiQuakes] = await Promise.allSettled([
    fetchEarthquakes({ significantOnly: true }),
    fetchEarthquakesAdvanced({ alertLevel: "orange", minMagnitude: 5.5 }),
    fetchEarthquakesAdvanced({ tsunamiOnly: true, minMagnitude: 5.0 }),
  ]);

  const seen = new Set<string>();
  const items: EarthquakeEvent[] = [];

  for (const result of [significant, alertQuakes, tsunamiQuakes]) {
    if (result.status === "fulfilled") {
      for (const q of result.value) {
        if (!seen.has(q.id)) {
          seen.add(q.id);
          items.push(q);
        }
      }
    }
  }

  items.sort((a, b) => b.significance - a.significance);
  return items;
}

export function earthquakesToNewsItems(quakes: EarthquakeEvent[]): NewsItem[] {
  return quakes.map((q) => {
    const alertTag = q.alert ? ` [PAGER: ${q.alert.toUpperCase()}]` : "";
    const tsunamiTag = q.tsunami ? " [TSUNAMI WARNING]" : "";
    const feltTag = q.felt && q.felt > 100 ? ` [FELT: ${q.felt} reports]` : "";
    return {
      id: `usgs_${q.id}`,
      title: `${q.title}${alertTag}${tsunamiTag}${feltTag}`,
      summary: `Magnitude ${q.magnitude} earthquake at ${q.place}. Significance: ${q.significance}/1000.${q.tsunami ? " Tsunami warning issued." : ""}${q.mmi ? ` ShakeMap intensity: ${q.mmi.toFixed(1)}.` : ""}`,
      source: { type: "web" as const, site: "USGS" },
      url: `https://earthquake.usgs.gov/earthquakes/eventpage/${q.id}`,
      publishedAt: new Date(q.time),
      keywords: ["earthquake", "seismic", q.place.split(",").pop()?.trim() ?? ""].filter(Boolean),
    };
  });
}

// ── NASA EONET: Earth Observatory Natural Event Tracker ──

const EONET_API = "https://eonet.gsfc.nasa.gov/api/v3/events";

// All available EONET categories
export const EONET_CATEGORIES = {
  drought: "drought",
  dustHaze: "dustHaze",
  earthquakes: "earthquakes",
  floods: "floods",
  landslides: "landslides",
  manmade: "manmade",
  seaLakeIce: "seaLakeIce",
  severeStorms: "severeStorms",
  snow: "snow",
  tempExtremes: "tempExtremes",
  volcanoes: "volcanoes",
  waterColor: "waterColor",
  wildfires: "wildfires",
} as const;

export type EonetCategoryKey = keyof typeof EONET_CATEGORIES;

export interface EonetEvent {
  id: string;
  title: string;
  categories: Array<{ id: string; title: string }>;
  closed: string | null;
  geometry: Array<{ magnitudeValue: number | null; magnitudeUnit: string | null; date: string; coordinates: number[] }>;
}

export async function fetchEonetEvents(
  opts?: {
    category?: string;
    days?: number;
    limit?: number;
    bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
    magMin?: number;
    magMax?: number;
    magId?: string; // e.g. "kts" for knots (storms), "NM" for nautical miles
  }
): Promise<EonetEvent[]> {
  try {
    const params: Record<string, any> = {
      status: "open",
      limit: opts?.limit ?? 30,
    };
    if (opts?.category) params.category = opts.category;
    if (opts?.days) params.days = opts.days;
    if (opts?.bbox) params.bbox = opts.bbox.join(",");
    if (opts?.magMin !== undefined) params.magMin = opts.magMin;
    if (opts?.magMax !== undefined) params.magMax = opts.magMax;
    if (opts?.magId) params.magID = opts.magId;

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

// Market-relevant EONET: only severe storms, wildfires, volcanoes
export async function fetchHighImpactEonetEvents(): Promise<EonetEvent[]> {
  const [storms, fires, volcanoes] = await Promise.allSettled([
    fetchEonetEvents({ category: "severeStorms", days: 3, limit: 15 }),
    fetchEonetEvents({ category: "wildfires", days: 3, limit: 15 }),
    fetchEonetEvents({ category: "volcanoes", days: 7, limit: 10 }),
  ]);

  const items: EonetEvent[] = [];
  if (storms.status === "fulfilled") items.push(...storms.value);
  if (fires.status === "fulfilled") items.push(...fires.value);
  if (volcanoes.status === "fulfilled") items.push(...volcanoes.value);
  return items;
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
  population: number;        // exposed population
  vulnerability: number;     // vulnerability score
  coordinates: [number, number];
}

export async function fetchGdacsEvents(
  opts?: { alertLevel?: string; eventTypes?: string; limit?: number }
): Promise<GdacsEvent[]> {
  try {
    const params: Record<string, string> = {
      eventlist: opts?.eventTypes ?? "EQ,TC,FL,VO,WF,DR",
      alertlevel: opts?.alertLevel ?? "Green;Orange;Red",
    };
    if (opts?.limit) params.limit = String(opts.limit);

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
      population: f.properties?.population?.value ?? f.properties?.populationdata?.population ?? 0,
      vulnerability: f.properties?.vulnerability?.value ?? 0,
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
    const popTag = e.population > 100_000 ? ` [POP: ${fmtPop(e.population)}]` : "";

    return {
      id: `gdacs_${e.eventType}_${e.eventId}`,
      title: `${alertEmoji} ${typeLabel}: ${e.name}${popTag}`.trim(),
      summary: `${e.severityText}. Alert level: ${e.alertLevel}. Affected: ${e.affectedCountries.slice(0, 5).join(", ") || e.country}.${e.population > 0 ? ` Exposed population: ${fmtPop(e.population)}.` : ""}`,
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

// ── High Signal Alerts: only market-moving events ──

export interface GeoAlert {
  source: "USGS" | "GDACS" | "EONET" | "GDELT";
  severity: "critical" | "high" | "medium";
  title: string;
  summary: string;
  url: string;
  publishedAt: Date;
  keywords: string[];
  population?: number;
  raw?: any;
}

export async function fetchHighSignalAlerts(): Promise<GeoAlert[]> {
  const alerts: GeoAlert[] = [];

  const [quakes, gdacs, eonet] = await Promise.allSettled([
    fetchHighSignalQuakes(),
    fetchGdacsEvents({ alertLevel: "Orange;Red" }),
    fetchHighImpactEonetEvents(),
  ]);

  // High-signal earthquakes
  if (quakes.status === "fulfilled") {
    for (const q of quakes.value) {
      const severity = q.alert === "red" || q.magnitude >= 7.0 ? "critical"
        : q.alert === "orange" || q.tsunami > 0 || q.magnitude >= 6.0 ? "high"
        : "medium";
      alerts.push({
        source: "USGS",
        severity,
        title: q.title,
        summary: `M${q.magnitude} at ${q.place}. Sig: ${q.significance}/1000.${q.tsunami ? " TSUNAMI." : ""}${q.felt ? ` Felt by ${q.felt}.` : ""}`,
        url: `https://earthquake.usgs.gov/earthquakes/eventpage/${q.id}`,
        publishedAt: new Date(q.time),
        keywords: ["earthquake", q.place.split(",").pop()?.trim() ?? ""].filter(Boolean),
        raw: q,
      });
    }
  }

  // GDACS red/orange alerts
  if (gdacs.status === "fulfilled") {
    for (const e of gdacs.value) {
      const typeLabels: Record<string, string> = { EQ: "Earthquake", TC: "Cyclone", FL: "Flood", VO: "Volcano", WF: "Wildfire", DR: "Drought" };
      const severity = e.alertLevel === "Red" ? "critical" : "high";
      alerts.push({
        source: "GDACS",
        severity,
        title: `${typeLabels[e.eventType] ?? e.eventType}: ${e.name}`,
        summary: `${e.severityText}. ${e.affectedCountries.slice(0, 3).join(", ") || e.country}.`,
        url: `https://www.gdacs.org/report.aspx?eventtype=${e.eventType}&eventid=${e.eventId}`,
        publishedAt: new Date(e.fromDate),
        keywords: [(typeLabels[e.eventType] ?? "").toLowerCase(), e.country.toLowerCase()].filter(Boolean),
        population: e.population,
        raw: e,
      });
    }
  }

  // High-impact natural events
  if (eonet.status === "fulfilled") {
    for (const e of eonet.value) {
      const cat = e.categories[0]?.title ?? "Event";
      const latest = e.geometry[e.geometry.length - 1];
      const mag = latest?.magnitudeValue;
      const severity = cat.toLowerCase().includes("volcano") ? "high" : "medium";
      alerts.push({
        source: "EONET",
        severity,
        title: `${cat}: ${e.title}`,
        summary: `${e.geometry.length} observation(s).${mag ? ` Magnitude: ${mag} ${latest?.magnitudeUnit ?? ""}.` : ""}`,
        url: `https://eonet.gsfc.nasa.gov/api/v3/events/${e.id}`,
        publishedAt: latest?.date ? new Date(latest.date) : new Date(),
        keywords: [cat.toLowerCase()].filter(Boolean),
        raw: e,
      });
    }
  }

  // Sort: critical first, then high, then medium, then by time
  const severityOrder = { critical: 0, high: 1, medium: 2 };
  alerts.sort((a, b) => {
    const diff = severityOrder[a.severity] - severityOrder[b.severity];
    if (diff !== 0) return diff;
    return b.publishedAt.getTime() - a.publishedAt.getTime();
  });

  return alerts;
}

// ── Utility ──

function fmtPop(pop: number): string {
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(1)}M`;
  if (pop >= 1_000) return `${(pop / 1_000).toFixed(0)}K`;
  return String(pop);
}

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
