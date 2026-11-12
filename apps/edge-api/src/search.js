const USER_AGENT =
  "Mozilla/5.0 (compatible; AETHERResearch/1.0; +https://github.com/FlameKaiser2201/aether-ai)";

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

function parseHtmlResults(html, maxResults) {
  const results = [];
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html)) && results.length < maxResults) {
    const attrs = match[1] || "";
    if (!/result__a/i.test(attrs)) continue;
    const href = /\bhref\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] || "";
    const url = unwrapDuckDuckGo(href);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const title = clean(match[2], 200) || "Untitled";
    const tail = html.slice(anchor.lastIndex, anchor.lastIndex + 4000);
    const snippetMatch = /<a\b[^>]*result__snippet[^>]*>([\s\S]*?)<\/a>/i.exec(tail);
    const snippet = snippetMatch ? clean(snippetMatch[1], 600) : "";
    if (results.some((item) => item.url === url)) continue;
    results.push({
      index: results.length + 1,
      title,
      url,
      snippet,
    });
  }
  return results;
}

async function duckDuckGoHtml(query, maxResults) {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    redirect: "follow",
  });
  if (!response.ok) return [];
  const html = await response.text();
  return parseHtmlResults(html, maxResults);
}

async function duckDuckGoInstant(query, maxResults) {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");
  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) return [];
  const data = await response.json();
  const results = [];
  if (data.AbstractText) {
    results.push({
      index: 1,
      title: data.Heading || "DuckDuckGo summary",
      url: data.AbstractURL || "https://duckduckgo.com/",
      snippet: clean(data.AbstractText, 600),
    });
  }
  for (const topic of data.RelatedTopics || []) {
    if (results.length >= maxResults) break;
    const item = topic.FirstURL ? topic : (topic.Topics || [])[0];
    if (!item?.FirstURL || !item?.Text) continue;
    results.push({
      index: results.length + 1,
      title: clean(item.Text, 120) || "Result",
      url: item.FirstURL,
      snippet: clean(item.Text, 600),
    });
  }
  return results;
}

export async function searchWeb(query, maxResults = 5) {
  const cleanQuery = String(query || "").trim().slice(0, 400);
  if (!cleanQuery) return [];
  try {
    const results = await duckDuckGoHtml(cleanQuery, maxResults);
    if (results.length) return results;
  } catch {
    // fall through to the instant-answer API
  }
  try {
    return await duckDuckGoInstant(cleanQuery, maxResults);
  } catch {
    return [];
  }
}
