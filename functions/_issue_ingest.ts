import { Env } from './_shared';

type IssueCategory = 'World' | 'Tech' | 'Business' | 'Culture' | 'Science' | 'Sports' | 'Internet';

type LiveIssueSource = {
  name: string;
  url: string;
};

type LiveIssue = {
  id: string;
  category: IssueCategory;
  createdAt: string;
  detail: string;
  hotScore: number;
  sensitive: boolean;
  sourceCount: number;
  sources: LiveIssueSource[];
  summary: string;
  title: string;
  velocity: number;
};

type HnStory = {
  id?: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time?: number;
  type?: string;
  deleted?: boolean;
  dead?: boolean;
};

type GdeltArticle = {
  title?: string;
  url?: string;
  domain?: string;
  seendate?: string;
  sourcecountry?: string;
  language?: string;
};

type RefreshResult = {
  attempted: number;
  upserted: number;
  sources: {
    gdelt: number;
    hackerNews: number;
    wikimedia: number;
  };
};

const currentEventsBaseUrl = 'https://en.wikipedia.org/w/api.php';
const gdeltDocUrl = 'https://api.gdeltproject.org/api/v2/doc/doc';
const hackerNewsBaseUrl = 'https://hacker-news.firebaseio.com/v0';

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export async function refreshLiveIssues(env: Env): Promise<RefreshResult> {
  const [wikimedia, hackerNews, gdelt] = await Promise.all([
    fetchWikimediaCurrentEvents(),
    fetchHackerNewsIssues(),
    fetchGdeltIssues(),
  ]);

  const issues = dedupeIssues([...wikimedia, ...hackerNews, ...gdelt]).slice(0, 50);
  await upsertIssues(env.DB, issues);

  return {
    attempted: issues.length,
    upserted: issues.length,
    sources: {
      gdelt: gdelt.length,
      hackerNews: hackerNews.length,
      wikimedia: wikimedia.length,
    },
  };
}

async function fetchWikimediaCurrentEvents(): Promise<LiveIssue[]> {
  const dates = recentDates(5);
  const issues: LiveIssue[] = [];

  for (const date of dates) {
    const page = currentEventsPageTitle(date);
    const url = new URL(currentEventsBaseUrl);
    url.searchParams.set('action', 'parse');
    url.searchParams.set('format', 'json');
    url.searchParams.set('page', page);
    url.searchParams.set('prop', 'wikitext');
    url.searchParams.set('redirects', '1');

    const data = await fetchJson<{
      parse?: {
        title?: string;
        wikitext?: {
          '*': string;
        };
      };
    }>(url.toString());

    const wikitext = data?.parse?.wikitext?.['*'];
    if (!wikitext) continue;
    issues.push(...(await parseCurrentEventsWikitext(wikitext, date, data.parse?.title || page)));
    if (issues.length >= 24) break;
  }

  return issues.slice(0, 24);
}

async function parseCurrentEventsWikitext(
  wikitext: string,
  date: Date,
  pageTitle: string,
): Promise<LiveIssue[]> {
  const issues: LiveIssue[] = [];
  let section = 'World';
  let pendingTopic = '';
  const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replaceAll(' ', '_'))}`;

  for (const rawLine of wikitext.split('\n')) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^'''([^']+)'''/);
    if (sectionMatch?.[1]) {
      section = sectionMatch[1];
      pendingTopic = '';
      continue;
    }

    if (!line.startsWith('*') || line.includes('All news items')) continue;

    const bulletLevel = line.match(/^\*+/)?.[0].length ?? 1;
    const rawContent = line.replace(/^\*+/, '').trim();
    const externalSources = extractExternalSources(rawContent);
    const clean = cleanWikitext(rawContent);
    if (!clean || clean.length < 24) continue;

    if (bulletLevel === 1 && externalSources.length === 0 && clean.length <= 140) {
      pendingTopic = clean;
      continue;
    }

    const title = pendingTopic && bulletLevel > 1 ? pendingTopic : titleFromText(clean);
    const summary = summarize(clean);
    const category = mapCurrentEventsCategory(section, clean);
    const id = await stableId('live', `${pageTitle}:${section}:${title}:${summary}`);
    const sources = externalSources.length
      ? externalSources
      : [{ name: 'Wikipedia Current Events', url: pageUrl }];

    issues.push({
      id,
      category,
      createdAt: date.toISOString(),
      detail: clean,
      hotScore: 7800 - issues.length * 75,
      sensitive: isSensitive(section, clean),
      sourceCount: sources.length,
      sources,
      summary,
      title,
      velocity: velocityFromAge(date),
    });

    if (bulletLevel === 1) pendingTopic = '';
  }

  return issues;
}

async function fetchHackerNewsIssues(): Promise<LiveIssue[]> {
  const ids = await fetchJson<number[]>(`${hackerNewsBaseUrl}/topstories.json`);
  if (!Array.isArray(ids)) return [];

  const stories = await Promise.all(
    ids.slice(0, 24).map((id) => fetchJson<HnStory>(`${hackerNewsBaseUrl}/item/${id}.json`)),
  );

  const issues: LiveIssue[] = [];
  for (const story of stories) {
    if (!story?.id || story.type !== 'story' || story.deleted || story.dead || !story.title) continue;

    const score = Number(story.score ?? 0);
    const comments = Number(story.descendants ?? 0);
    const createdAt = story.time ? new Date(story.time * 1000) : new Date();
    const title = story.title.trim();
    const sourceUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const category = mapHackerNewsCategory(title, sourceUrl);
    const id = await stableId('hn', String(story.id));

    issues.push({
      id,
      category,
      createdAt: createdAt.toISOString(),
      detail: `Hacker News discussion about "${title}". The story currently has ${score} points and ${comments} comments on Hacker News.`,
      hotScore: 7000 + score * 12 + comments * 5,
      sensitive: false,
      sourceCount: 2,
      sources: [
        { name: sourceHost(sourceUrl), url: sourceUrl },
        { name: 'Hacker News discussion', url: `https://news.ycombinator.com/item?id=${story.id}` },
      ],
      summary: `Developers and technology readers are discussing "${title}" on Hacker News.`,
      title,
      velocity: Math.max(45, Math.min(99, Math.round(score / 8 + comments / 12 + 50))),
    });
  }

  return issues.slice(0, 12);
}

async function fetchGdeltIssues(): Promise<LiveIssue[]> {
  const url = new URL(gdeltDocUrl);
  url.searchParams.set('query', '(climate OR election OR economy OR technology OR science OR sports)');
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('maxrecords', '12');
  url.searchParams.set('format', 'json');
  url.searchParams.set('timespan', '24h');
  url.searchParams.set('sort', 'hybridrel');

  const data = await fetchJson<{ articles?: GdeltArticle[] }>(url.toString());
  const articles = data?.articles ?? [];
  const issues: LiveIssue[] = [];

  for (const article of articles) {
    if (!article.title || !article.url) continue;

    const title = cleanText(article.title);
    const category = mapTextCategory(`${title} ${article.domain || ''}`);
    const createdAt = parseGdeltDate(article.seendate);
    const id = await stableId('gdelt', article.url);
    const sourceName = article.domain || sourceHost(article.url);

    issues.push({
      id,
      category,
      createdAt: createdAt.toISOString(),
      detail: `${title} Source country: ${article.sourcecountry || 'unknown'}. Language: ${article.language || 'unknown'}.`,
      hotScore: 6900 - issues.length * 60,
      sensitive: isSensitive('', title),
      sourceCount: 1,
      sources: [{ name: sourceName, url: article.url }],
      summary: title,
      title,
      velocity: velocityFromAge(createdAt),
    });
  }

  return issues;
}

async function upsertIssues(db: D1Database, issues: LiveIssue[]): Promise<void> {
  if (!issues.length) return;

  const statements: D1PreparedStatement[] = [];
  for (const issue of issues) {
    statements.push(
      db
        .prepare(
          `
            INSERT INTO issues
              (id, title, summary, detail, category, source_count, created_at, hot_score, status_badge, reaction_velocity, is_sensitive, seed_like_count, seed_dislike_count, seed_comment_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              summary = excluded.summary,
              detail = excluded.detail,
              category = excluded.category,
              source_count = excluded.source_count,
              created_at = excluded.created_at,
              hot_score = excluded.hot_score,
              status_badge = excluded.status_badge,
              reaction_velocity = excluded.reaction_velocity,
              is_sensitive = excluded.is_sensitive
          `,
        )
        .bind(
          issue.id,
          issue.title,
          issue.summary,
          issue.detail,
          issue.category,
          issue.sourceCount,
          issue.createdAt,
          issue.hotScore,
          statusBadge(issue),
          issue.velocity,
          issue.sensitive ? 1 : 0,
        ),
    );

    for (const [index, source] of issue.sources.entries()) {
      statements.push(
        db
          .prepare(
            `
              INSERT INTO issue_sources
                (id, issue_id, source_name, source_url)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                source_name = excluded.source_name,
                source_url = excluded.source_url
            `,
          )
          .bind(`${issue.id}_source_${index}`, issue.id, source.name, source.url),
      );
    }
  }

  await db.batch(statements);
}

function dedupeIssues(issues: LiveIssue[]): LiveIssue[] {
  const seen = new Set<string>();
  const unique: LiveIssue[] = [];

  for (const issue of issues.sort((a, b) => b.hotScore - a.hotScore)) {
    const key = normalizeDedupeKey(issue.title);
    if (seen.has(issue.id) || seen.has(key)) continue;
    seen.add(issue.id);
    seen.add(key);
    unique.push(issue);
  }

  return unique;
}

function recentDates(days: number): Date[] {
  const dates: Date[] = [];
  const now = new Date();
  for (let offset = 0; offset < days; offset += 1) {
    dates.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset)));
  }
  return dates;
}

function currentEventsPageTitle(date: Date): string {
  return `Portal:Current events/${date.getUTCFullYear()} ${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function extractExternalSources(text: string): LiveIssueSource[] {
  const sources: LiveIssueSource[] = [];
  const matches = text.matchAll(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g);
  for (const match of matches) {
    const url = match[1];
    const name = cleanText(match[2].replace(/[()]/g, '')) || sourceHost(url);
    sources.push({ name, url });
  }
  return sources.slice(0, 3);
}

function cleanWikitext(text: string): string {
  return cleanText(
    text
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\[https?:\/\/[^\s\]]+\s+[^\]]+\]/g, ' ')
      .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\{\{[^{}]*\}\}/g, ' ')
      .replace(/'{2,}/g, '')
      .replace(/&nbsp;/g, ' '),
  );
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function summarize(text: string): string {
  const clean = cleanText(text);
  if (clean.length <= 220) return clean;
  return `${clean.slice(0, 217).trim()}...`;
}

function titleFromText(text: string): string {
  const sentence = cleanText(text).split(/(?<=[.!?])\s+/)[0] || text;
  if (sentence.length <= 96) return sentence;
  return `${sentence.slice(0, 93).trim()}...`;
}

function mapCurrentEventsCategory(section: string, text: string): IssueCategory {
  const combined = `${section} ${text}`.toLowerCase();
  if (combined.includes('sports')) return 'Sports';
  if (combined.includes('arts') || combined.includes('culture') || combined.includes('entertainment')) {
    return 'Culture';
  }
  if (combined.includes('business') || combined.includes('econom') || combined.includes('market')) {
    return 'Business';
  }
  if (combined.includes('technology') || combined.includes('internet') || combined.includes('cyber')) {
    return 'Tech';
  }
  if (combined.includes('science') || combined.includes('health') || combined.includes('space')) {
    return 'Science';
  }
  return mapTextCategory(text);
}

function mapHackerNewsCategory(title: string, url: string): IssueCategory {
  const text = `${title} ${url}`.toLowerCase();
  if (text.includes('web') || text.includes('social') || text.includes('browser') || text.includes('internet')) {
    return 'Internet';
  }
  return 'Tech';
}

function mapTextCategory(text: string): IssueCategory {
  const normalized = text.toLowerCase();
  if (/\b(sport|football|basketball|tennis|baseball|cricket|league|club)\b/.test(normalized)) {
    return 'Sports';
  }
  if (/\b(film|music|album|museum|festival|artist|culture|book|streaming)\b/.test(normalized)) {
    return 'Culture';
  }
  if (/\b(ai|software|chip|app|developer|cyber|platform|internet|browser|open source|model)\b/.test(normalized)) {
    return 'Tech';
  }
  if (/\b(science|space|climate|health|medicine|research|battery|ocean)\b/.test(normalized)) {
    return 'Science';
  }
  if (/\b(business|economy|market|trade|company|price|inflation|bank|stock)\b/.test(normalized)) {
    return 'Business';
  }
  return 'World';
}

function isSensitive(section: string, text: string): boolean {
  return /\b(war|attack|killed|death|crime|disaster|earthquake|conflict|shooting|disease|outbreak|election)\b/i.test(
    `${section} ${text}`,
  );
}

function statusBadge(issue: LiveIssue): string {
  if (issue.sensitive) return 'Context-dependent';
  if (issue.velocity > 85) return 'Rising';
  return 'Hot';
}

function velocityFromAge(date: Date): number {
  const ageHours = Math.max(0, (Date.now() - date.getTime()) / 3600000);
  return Math.max(35, Math.min(96, Math.round(96 - ageHours * 4)));
}

function parseGdeltDate(value?: string): Date {
  if (!value) return new Date();
  const compact = value.replace(/\D/g, '');
  if (compact.length >= 14) {
    const year = Number(compact.slice(0, 4));
    const month = Number(compact.slice(4, 6)) - 1;
    const day = Number(compact.slice(6, 8));
    const hour = Number(compact.slice(8, 10));
    const minute = Number(compact.slice(10, 12));
    const second = Number(compact.slice(12, 14));
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

function normalizeDedupeKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 3)
    .slice(0, 8)
    .join(' ');
}

async function stableId(prefix: string, input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex.slice(0, 24)}`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GlobalPulse/0.1 contact: operator',
      },
    });
    if (!response.ok) return null;
    const text = await response.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
