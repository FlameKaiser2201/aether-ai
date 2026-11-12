const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CURRENT_INFO =
  /\b(latest|current|currently|today|tonight|now|news|breaking|price|prices|cost|release|released|version|update|weather|forecast|stock|stocks|score|scores|election|who is|what happened|this week|this month|this year|20(2[4-9]|3[0-9]))\b/i;

export function shouldSearch(message, explicit) {
  if (explicit === true) return true;
  if (explicit === false) return false;
  return CURRENT_INFO.test(String(message || ""));
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function clean(value, limit = 600) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function unwrapDuckDuckGo(href) {
  let url = String(href || "");
  if (url.startsWith("//")) url = `https:${url}`;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("duckduckgo.com") && parsed.searchParams.get("uddg")) {
      return parsed.searchParams.get("uddg");
    }
  } catch {
    // keep the original
  }
  return url;
}

function pushResult(results, url, title, snippet, maxResults) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  if (results.length >= maxResults) return;
  if (results.some((item) => item.url === url)) return;
  results.push({
    index: results.length + 1,
    title: title || "Untitled",
    url,
    snippet,
  });
}

/**
 * Parse the DuckDuckGo Lite table layout. The public HTML endpoint answers
 * Worker requests with a 202 bot challenge, but Lite still serves real results.
 * Each hit is an `<a class="result-link">` followed by a
 * `<td class="result-snippet">` row.
 */
function parseLiteResults(html, maxResults) {
  const results = [];
  const anchor = /<a\b([^>]*class\s*=\s*['"][^'"]*result-link[^'"]*['"][^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html)) && results.length < maxResults) {
    const href = /\bhref\s*=\s*"([^"]+)"/i.exec(match[1])?.[1] || "";
    const url = unwrapDuckDuckGo(href);
    const title = clean(match[2], 200);
    const tail = html.slice(anchor.lastIndex, anchor.lastIndex + 2500);
    const snippetMatch = /<td\b[^>]*class\s*=\s*['"][^'"]*result-snippet[^'"]*['"][^>]*>([\s\S]*?)<\/td>/i.exec(
      tail,
    );
    const snippet = snippetMatch ? clean(snippetMatch[1], 600) : "";
    pushResult(results, url, title, snippet, maxResults);
  }
  return results;
}

function parseHtmlResults(html, maxResults) {
  const results = [];
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html)) && results.length < maxResults) {
    const attrs = match[1] || "";
    if (!/result__a/i.test(attrs)) continue;
    const href = /\bhref\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] || "";
    const url = unwrapDuckDuckGo(href);
    const title = clean(match[2], 200) || "Untitled";
    const tail = html.slice(anchor.lastIndex, anchor.lastIndex + 4000);
    const snippetMatch = /<a\b[^>]*result__snippet[^>]*>([\s\S]*?)<\/a>/i.exec(tail);
    const snippet = snippetMatch ? clean(snippetMatch[1], 600) : "";
    pushResult(results, url, title, snippet, maxResults);
  }
  return results;
}

async function fetchText(url, accept) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return "";
  return response.text();
}

async function duckDuckGoLite(query, maxResults) {
  const url = new URL("https://lite.duckduckgo.com/lite/");
  url.searchParams.set("q", query);
  return parseLiteResults(await fetchText(url.toString(), "text/html"), maxResults);
}

async function duckDuckGoHtml(query, maxResults) {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  return parseHtmlResults(await fetchText(url.toString(), "text/html"), maxResults);
}

async function duckDuckGoInstant(query, maxResults) {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");
  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const data = await response.json();
  const results = [];
  if (data.AbstractText) {
    pushResult(
      results,
      data.AbstractURL || "https://duckduckgo.com/",
      data.Heading || "DuckDuckGo summary",
      clean(data.AbstractText, 600),
      maxResults,
    );
  }
  for (const topic of data.RelatedTopics || []) {
    if (results.length >= maxResults) break;
    const item = topic.FirstURL ? topic : (topic.Topics || [])[0];
    if (!item?.FirstURL || !item?.Text) continue;
    pushResult(results, item.FirstURL, clean(item.Text, 120) || "Result", clean(item.Text, 600), maxResults);
  }
  return results;
}

async function wikipedia(query, maxResults) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("utf8", "1");
  url.searchParams.set("srlimit", String(maxResults));
  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const data = await response.json();
  const results = [];
  for (const hit of data?.query?.search || []) {
    const title = String(hit.title || "").trim();
    if (!title) continue;
    pushResult(
      results,
      `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      title,
      clean(hit.snippet, 600),
      maxResults,
    );
  }
  return results;
}

async function attempt(search, label) {
  try {
    return await search();
  } catch (error) {
    console.warn(`search ${label} failed`, String(error));
    return [];
  }
}

export async function searchWeb(query, maxResults = 5) {
  const cleanQuery = String(query || "").trim().slice(0, 400);
  if (!cleanQuery) return [];

  const providers = [
    ["lite", () => duckDuckGoLite(cleanQuery, maxResults)],
    ["html", () => duckDuckGoHtml(cleanQuery, maxResults)],
    [
      "lite-retry",
      async () => {
        // A burst of requests can briefly trip DuckDuckGo's bot challenge.
        // Wait out the challenge window and try the most reliable parser again.
        await new Promise((resolve) => setTimeout(resolve, 500));
        return duckDuckGoLite(cleanQuery, maxResults);
      },
    ],
    ["instant", () => duckDuckGoInstant(cleanQuery, maxResults)],
    ["wikipedia", () => wikipedia(cleanQuery, maxResults)],
  ];

  for (const [label, search] of providers) {
    const results = await attempt(search, label);
    if (results.length) return results;
  }
  return [];
}
