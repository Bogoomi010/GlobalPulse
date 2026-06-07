import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  EyeOff,
  Flame,
  Globe2,
  LogIn,
  MessageCircle,
  RotateCcw,
  Search,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  User,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type Category = 'World' | 'Tech' | 'Business' | 'Culture' | 'Science' | 'Sports' | 'Internet';
type SortKey = 'Hot' | 'New' | 'Most Liked' | 'Most Disliked' | 'Most Divided' | 'Most Commented';
type Reaction = 'like' | 'dislike';
type View = 'feed' | 'about' | 'policy' | 'moderation';
type ModerationStatus = 'open' | 'reviewed' | 'all';
type ModerationAction = 'hide' | 'restore' | 'dismiss';

type Source = {
  name: string;
  url: string;
};

type Issue = {
  id: string;
  category: Category;
  createdHoursAgo: number;
  sourceCount: number;
  title: string;
  summary: string;
  detail: string;
  likes: number;
  dislikes: number;
  comments: number;
  velocity: number;
  sensitive?: boolean;
  sources: Source[];
};

type Comment = {
  id: string;
  issueId: string;
  userId?: string;
  author: string;
  content: string;
  cost: number;
  createdAt: string;
  status: 'visible' | 'hidden' | 'deleted' | 'reported';
};

type SessionUser = {
  id?: string;
  email: string;
  displayName: string;
  countryCode: string;
  sessionToken?: string;
};

type ModerationReport = {
  commentId: string;
  issueId: string;
  issueTitle: string;
  content: string;
  commentStatus: Comment['status'];
  commentCreatedAt: string;
  author: {
    name: string;
    email: string;
  };
  review: {
    action: ModerationAction;
    note: string | null;
    reviewedAt: string | null;
  } | null;
  reportCount: number;
  openReportCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
};

type IssueRefreshResult = {
  attempted: number;
  upserted: number;
  sources: {
    gdelt: number;
    hackerNews: number;
    wikimedia: number;
  };
  status: 'refreshed';
};

type RuntimeStatus = {
  auth: {
    emailFromConfigured: boolean;
    logDeliveryEnabled: boolean;
    provider: string;
    resendConfigured: boolean;
  };
  config: {
    appPublicOriginConfigured: boolean;
    appPublicOriginHttps: boolean;
    appPublicOriginMatchesRequest: boolean;
    demoLoginEnabled: boolean;
    launchReviewAcknowledged: boolean;
    moderationAdminTokenConfigured: boolean;
    sessionSecretConfigured: boolean;
  };
  d1: {
    issueCount: number;
    missingTables: string[];
    requiredTableCount: number;
    requiredTablesPresent: boolean;
  };
  payments: {
    activePlanCount: number;
    legacySecretCount: number;
    legacySecretsPresent: string[];
    mode: 'disabled';
  };
  status: 'ok';
};

type AuthStep = 'details' | 'code';

type PendingAuth = {
  email: string;
  displayName: string;
  countryCode: string;
};

const categories: Category[] = ['World', 'Tech', 'Business', 'Culture', 'Science', 'Sports', 'Internet'];
const sortTabs: SortKey[] = [
  'Hot',
  'New',
  'Most Liked',
  'Most Disliked',
  'Most Divided',
  'Most Commented',
];

const seedIssues: Issue[] = [
  {
    id: 'issue-001',
    category: 'World',
    createdHoursAgo: 1,
    sourceCount: 14,
    title: 'Multiple capitals debate a new climate finance framework',
    summary: 'Governments are weighing a proposal that could shift how adaptation funds are distributed.',
    detail:
      'Officials and civic groups are discussing a climate finance framework across several regions. Supporters say the approach could direct aid faster, while critics question oversight and eligibility. The issue remains context-dependent and no single outcome is settled.',
    likes: 18420,
    dislikes: 6320,
    comments: 342,
    velocity: 96,
    sensitive: true,
    sources: [
      { name: 'Global wire brief', url: 'https://example.com/climate-brief' },
      { name: 'Policy tracker', url: 'https://example.com/policy-tracker' },
    ],
  },
  {
    id: 'issue-002',
    category: 'Tech',
    createdHoursAgo: 3,
    sourceCount: 9,
    title: 'Open model benchmarks trigger another AI tooling debate',
    summary: 'Developers are comparing speed, cost, and reliability after new public benchmark results.',
    detail:
      'The discussion centers on how benchmark results should be interpreted in production contexts. Teams are reacting to cost, latency, safety, and ecosystem tradeoffs rather than treating one benchmark as a final answer.',
    likes: 22100,
    dislikes: 8900,
    comments: 611,
    velocity: 91,
    sources: [
      { name: 'Developer forum digest', url: 'https://example.com/ai-benchmarks' },
      { name: 'Research roundup', url: 'https://example.com/model-roundup' },
    ],
  },
  {
    id: 'issue-003',
    category: 'Business',
    createdHoursAgo: 5,
    sourceCount: 7,
    title: 'Streaming bundles return as media firms test new pricing',
    summary: 'Consumers are reacting to bundle discounts, ad tiers, and cancellation rules.',
    detail:
      'Media companies are experimenting with bundle pricing as growth patterns change. Reactions vary between users who want simpler subscriptions and users concerned about lock-in, ads, and hidden costs.',
    likes: 8300,
    dislikes: 11200,
    comments: 201,
    velocity: 73,
    sources: [{ name: 'Market note', url: 'https://example.com/streaming-bundles' }],
  },
  {
    id: 'issue-004',
    category: 'Culture',
    createdHoursAgo: 2,
    sourceCount: 11,
    title: 'A surprise album rollout dominates short-form video trends',
    summary: 'Clips, fan edits, and chart projections are pushing the release across platforms.',
    detail:
      'The album rollout is spreading through creator clips and fan communities. People are responding to the music, promotion strategy, and platform algorithms that amplify early reactions.',
    likes: 41500,
    dislikes: 5100,
    comments: 1204,
    velocity: 98,
    sources: [{ name: 'Culture pulse', url: 'https://example.com/album-trend' }],
  },
  {
    id: 'issue-005',
    category: 'Science',
    createdHoursAgo: 9,
    sourceCount: 6,
    title: 'New battery paper draws attention from EV watchers',
    summary: 'A lab result is raising cautious interest around density, charging speed, and scale.',
    detail:
      'A recently discussed battery result has prompted interest from researchers and EV communities. The main debate is whether promising lab performance can translate into durable and affordable production.',
    likes: 12600,
    dislikes: 2800,
    comments: 184,
    velocity: 65,
    sources: [{ name: 'Science digest', url: 'https://example.com/battery-paper' }],
  },
  {
    id: 'issue-006',
    category: 'Sports',
    createdHoursAgo: 6,
    sourceCount: 12,
    title: 'Finals officiating discussion splits global basketball fans',
    summary: 'Fans are arguing over late-game calls, replay standards, and player reactions.',
    detail:
      'Basketball fans are debating officiating standards after a close game. The conversation is highly divided, with many comments focusing on consistency rather than claiming a definitive intent.',
    likes: 14100,
    dislikes: 13950,
    comments: 890,
    velocity: 88,
    sensitive: true,
    sources: [{ name: 'Sports wire', url: 'https://example.com/finals-calls' }],
  },
  {
    id: 'issue-007',
    category: 'Internet',
    createdHoursAgo: 4,
    sourceCount: 18,
    title: 'A browser game meme becomes a workplace productivity joke',
    summary: 'Screenshots and leaderboards are spreading as teams turn the meme into office banter.',
    detail:
      'A simple browser game trend is being remixed into workplace jokes and leaderboard posts. Reactions are mostly playful, though some users are discussing distraction and platform moderation.',
    likes: 30200,
    dislikes: 3700,
    comments: 532,
    velocity: 94,
    sources: [{ name: 'Internet trend desk', url: 'https://example.com/browser-game-meme' }],
  },
  {
    id: 'issue-008',
    category: 'World',
    createdHoursAgo: 11,
    sourceCount: 10,
    title: 'City transit pilots free weekend routes amid cost debate',
    summary: 'Residents are reacting to access gains, budget pressure, and traffic impacts.',
    detail:
      'A free weekend transit pilot is drawing attention from commuters and local businesses. Supporters emphasize access and congestion, while critics focus on costs and long-term funding.',
    likes: 9200,
    dislikes: 4100,
    comments: 166,
    velocity: 58,
    sources: [{ name: 'Urban policy note', url: 'https://example.com/transit-pilot' }],
  },
  {
    id: 'issue-009',
    category: 'Tech',
    createdHoursAgo: 16,
    sourceCount: 8,
    title: 'Developers question app store fee changes after new rollout',
    summary: 'Indie teams and platform watchers are comparing fees, compliance work, and reach.',
    detail:
      'App developers are evaluating a platform policy change. Reactions differ depending on business model, geography, and whether teams expect the new structure to lower or raise operating costs.',
    likes: 7800,
    dislikes: 9900,
    comments: 377,
    velocity: 62,
    sources: [{ name: 'Platform policy digest', url: 'https://example.com/app-store-fees' }],
  },
  {
    id: 'issue-010',
    category: 'Business',
    createdHoursAgo: 22,
    sourceCount: 5,
    title: 'Coffee chain tests dynamic pricing in selected markets',
    summary: 'Customers are responding to time-based offers, app rewards, and fairness concerns.',
    detail:
      'A retail pricing pilot is generating mixed reactions. Some users see it as a way to discount slow periods, while others worry it could normalize confusing or unfair price changes.',
    likes: 5100,
    dislikes: 14500,
    comments: 298,
    velocity: 57,
    sources: [{ name: 'Retail brief', url: 'https://example.com/dynamic-coffee' }],
  },
  {
    id: 'issue-011',
    category: 'Culture',
    createdHoursAgo: 14,
    sourceCount: 9,
    title: 'Film festival lineup sparks genre-versus-prestige debate',
    summary: 'Viewers are discussing whether popular genre titles are getting more serious attention.',
    detail:
      'A festival lineup has prompted conversation about genre films and awards positioning. The reaction is not about a single right answer, but about changing taste and programming priorities.',
    likes: 11500,
    dislikes: 3400,
    comments: 219,
    velocity: 54,
    sources: [{ name: 'Festival tracker', url: 'https://example.com/festival-lineup' }],
  },
  {
    id: 'issue-012',
    category: 'Science',
    createdHoursAgo: 7,
    sourceCount: 13,
    title: 'Public health dashboard redesign gets mixed reactions',
    summary: 'Users praise clearer visuals but question how uncertainty is communicated.',
    detail:
      'A public health dashboard redesign is being discussed by data teams and residents. The conversation focuses on clarity, uncertainty, and whether simplified visuals hide important caveats.',
    likes: 7600,
    dislikes: 7200,
    comments: 153,
    velocity: 69,
    sensitive: true,
    sources: [{ name: 'Data civic lab', url: 'https://example.com/health-dashboard' }],
  },
  {
    id: 'issue-013',
    category: 'Sports',
    createdHoursAgo: 19,
    sourceCount: 4,
    title: 'A transfer rumor pushes football forums into watch mode',
    summary: 'Fans are parsing agent comments, club finances, and tactical fit.',
    detail:
      'A transfer rumor is moving through fan communities. Reactions are shaped by club loyalty, source credibility, and whether the player would fit the current squad structure.',
    likes: 9800,
    dislikes: 2100,
    comments: 431,
    velocity: 61,
    sources: [{ name: 'Transfer watch', url: 'https://example.com/transfer-rumor' }],
  },
  {
    id: 'issue-014',
    category: 'Internet',
    createdHoursAgo: 12,
    sourceCount: 15,
    title: 'Creator platform policy update divides moderators',
    summary: 'Communities are reacting to enforcement details and appeal timelines.',
    detail:
      'A creator platform policy update has generated moderator discussion. Supporters point to clearer rules, while critics are concerned about enforcement, appeals, and edge cases.',
    likes: 13200,
    dislikes: 12800,
    comments: 711,
    velocity: 82,
    sensitive: true,
    sources: [{ name: 'Creator economy digest', url: 'https://example.com/mod-policy' }],
  },
  {
    id: 'issue-015',
    category: 'World',
    createdHoursAgo: 28,
    sourceCount: 6,
    title: 'Regional food shortage alerts lead to logistics debate',
    summary: 'Aid groups, governments, and residents are discussing delivery routes and pricing.',
    detail:
      'Food shortage alerts are prompting discussion about supply chains and humanitarian logistics. The issue may be complex and context-dependent, with local conditions shaping reactions.',
    likes: 6800,
    dislikes: 6400,
    comments: 244,
    velocity: 45,
    sensitive: true,
    sources: [{ name: 'Relief operations brief', url: 'https://example.com/food-logistics' }],
  },
  {
    id: 'issue-016',
    category: 'Tech',
    createdHoursAgo: 31,
    sourceCount: 3,
    title: 'New handheld console leak starts battery-life argument',
    summary: 'Gamers are comparing portability, display quality, thermal limits, and price.',
    detail:
      'A handheld console leak has started a familiar hardware debate. Users are reacting to rumored specs while acknowledging that unconfirmed details can change before launch.',
    likes: 16400,
    dislikes: 4900,
    comments: 388,
    velocity: 53,
    sources: [{ name: 'Hardware watch', url: 'https://example.com/handheld-leak' }],
  },
  {
    id: 'issue-017',
    category: 'Business',
    createdHoursAgo: 36,
    sourceCount: 4,
    title: 'Airline baggage subscription idea faces customer pushback',
    summary: 'Travelers are reacting to convenience claims, fee fatigue, and refund questions.',
    detail:
      'An airline baggage subscription concept is being discussed by travelers. Reactions are mostly negative around fee complexity, though some frequent travelers see possible convenience.',
    likes: 3900,
    dislikes: 17800,
    comments: 305,
    velocity: 49,
    sources: [{ name: 'Travel market note', url: 'https://example.com/baggage-plan' }],
  },
  {
    id: 'issue-018',
    category: 'Culture',
    createdHoursAgo: 42,
    sourceCount: 5,
    title: 'Museum night program trends with younger visitors',
    summary: 'Extended hours, live sets, and lower ticket bundles are drawing attention.',
    detail:
      'A museum night program is gaining attention through social clips and local press. Reactions are mostly positive, with some discussion about crowding and access.',
    likes: 8700,
    dislikes: 900,
    comments: 88,
    velocity: 37,
    sources: [{ name: 'City culture note', url: 'https://example.com/museum-night' }],
  },
  {
    id: 'issue-019',
    category: 'Science',
    createdHoursAgo: 47,
    sourceCount: 6,
    title: 'Ocean cleanup robot footage spreads beyond science circles',
    summary: 'Viewers are weighing visible progress against scale, cost, and ecological concerns.',
    detail:
      'Footage of an ocean cleanup robot has spread across platforms. Users are reacting to the visuals, while experts and observers point to scale and ecosystem tradeoffs.',
    likes: 15100,
    dislikes: 3100,
    comments: 198,
    velocity: 41,
    sources: [{ name: 'Ocean tech digest', url: 'https://example.com/ocean-robot' }],
  },
  {
    id: 'issue-020',
    category: 'Internet',
    createdHoursAgo: 54,
    sourceCount: 8,
    title: 'Viral spreadsheet template becomes a personal finance trend',
    summary: 'Users are sharing budgets, savings dashboards, and debates over public money diaries.',
    detail:
      'A spreadsheet template has become a personal finance trend. Reactions are positive around clarity and habit building, with privacy concerns around public sharing.',
    likes: 10900,
    dislikes: 2200,
    comments: 276,
    velocity: 44,
    sources: [{ name: 'Internet money diary', url: 'https://example.com/spreadsheet-finance' }],
  },
];

const freeCommentCost = 0;

const formatCount = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
};

const getReactionStats = (issue: Issue) => {
  const total = issue.likes + issue.dislikes;
  if (!total) return { total, likePct: 0, dislikePct: 0 };
  const likePct = Math.round((issue.likes / total) * 100);
  return { total, likePct, dislikePct: 100 - likePct };
};

const getBadge = (issue: Issue) => {
  const { total, likePct, dislikePct } = getReactionStats(issue);
  if (issue.comments > 650) return 'Highly Discussed';
  if (issue.velocity > 85) return 'Rising';
  if (total > 25000 && issue.createdHoursAgo < 8) return 'Hot';
  if (Math.abs(likePct - dislikePct) <= 8) return 'Divided';
  if (likePct >= 65) return 'Mostly Positive';
  if (dislikePct >= 60) return 'Mostly Negative';
  return 'Hot';
};

const hotScore = (issue: Issue) => {
  const { total } = getReactionStats(issue);
  const recency = Math.max(0, 72 - issue.createdHoursAgo) * 18;
  return total * 0.04 + issue.comments * 8 + issue.sourceCount * 45 + issue.velocity * 22 + recency;
};

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const getOrCreateAnonymousToken = () => {
  const existing = localStorage.getItem('globalpulse:anonymous-token');
  if (existing) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem('globalpulse:anonymous-token', token);
  return token;
};

const requestJson = async <T,>(url: string, init?: RequestInit): Promise<T | null> => {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const authHeaders = (user: SessionUser | null): HeadersInit =>
  user?.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {};

const moderationHeaders = (token: string): HeadersInit =>
  token ? { Authorization: `Bearer ${token}` } : {};

export default function App() {
  const [issues, setIssues] = useState<Issue[]>(() => readJson('globalpulse:issues', seedIssues));
  const [comments, setComments] = useState<Comment[]>(() => readJson('globalpulse:comments', []));
  const [reactions, setReactions] = useState<Record<string, Reaction | undefined>>(() =>
    readJson('globalpulse:reactions', {}),
  );
  const [user, setUser] = useState<SessionUser | null>(() => readJson('globalpulse:user', null));
  const [anonymousToken] = useState(getOrCreateAnonymousToken);
  const [apiOnline, setApiOnline] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('Hot');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('feed');
  const [authOpen, setAuthOpen] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>('details');
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const [authMessage, setAuthMessage] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [moderationToken, setModerationToken] = useState(() => localStorage.getItem('globalpulse:moderation-token') ?? '');
  const [moderationStatus, setModerationStatus] = useState<ModerationStatus>('open');
  const [moderationReports, setModerationReports] = useState<ModerationReport[]>([]);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [moderationMessage, setModerationMessage] = useState('');
  const [issueRefreshBusy, setIssueRefreshBusy] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);

  const activeIssue = issues.find((issue) => issue.id === activeIssueId) ?? null;
  const activeSessionToken = user?.sessionToken;

  useEffect(() => {
    let cancelled = false;
    void requestJson<{ issues: Issue[] }>('/api/issues').then((data) => {
      if (cancelled || !data?.issues?.length) return;
      setApiOnline(true);
      setIssues(data.issues);
      writeJson('globalpulse:issues', data.issues);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionToken) return;
    let cancelled = false;
    void requestJson<{ user: Omit<SessionUser, 'sessionToken'> }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${activeSessionToken}` },
    }).then((data) => {
      if (cancelled) return;
      if (!data) {
        setUser(null);
        localStorage.removeItem('globalpulse:user');
        return;
      }
      setApiOnline(true);
      const nextUser = { ...data.user, sessionToken: activeSessionToken };
      setUser(nextUser);
      writeJson('globalpulse:user', nextUser);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSessionToken]);

  useEffect(() => {
    if (!activeIssueId) return;
    let cancelled = false;
    void requestJson<{ comments: Comment[] }>(
      `/api/comments?issueId=${encodeURIComponent(activeIssueId)}`,
    ).then((data) => {
      if (cancelled || !data) return;
      setApiOnline(true);
      setComments((currentComments) => {
        const otherComments = currentComments.filter((comment) => comment.issueId !== activeIssueId);
        const nextComments = [...data.comments, ...otherComments];
        writeJson('globalpulse:comments', nextComments);
        return nextComments;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeIssueId]);

  useEffect(() => {
    if (view !== 'moderation' || !moderationToken) return;
    let cancelled = false;
    setModerationBusy(true);
    setModerationMessage('');
    void requestJson<RuntimeStatus>('/api/admin/status', {
      headers: moderationHeaders(moderationToken),
    }).then((data) => {
      if (cancelled) return;
      if (data) setRuntimeStatus(data);
      else setRuntimeStatus(null);
    });
    void requestJson<{ reports: ModerationReport[] }>(
      `/api/moderation/reports?status=${encodeURIComponent(moderationStatus)}`,
      { headers: moderationHeaders(moderationToken) },
    ).then((data) => {
      if (cancelled) return;
      setModerationBusy(false);
      if (!data) {
        setModerationReports([]);
        setRuntimeStatus(null);
        setModerationMessage('운영 토큰이 맞지 않거나 모더레이션 API가 아직 연결되지 않았습니다.');
        return;
      }
      setApiOnline(true);
      setModerationReports(data.reports);
    });
    return () => {
      cancelled = true;
    };
  }, [moderationStatus, moderationToken, view]);

  const filteredIssues = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = issues.filter((issue) => {
      const matchesCategory = activeCategory === 'All' || issue.category === activeCategory;
      const matchesQuery =
        !normalized ||
        issue.title.toLowerCase().includes(normalized) ||
        issue.summary.toLowerCase().includes(normalized) ||
        issue.category.toLowerCase().includes(normalized);
      return matchesCategory && matchesQuery;
    });

    return [...list].sort((a, b) => {
      const aStats = getReactionStats(a);
      const bStats = getReactionStats(b);
      if (sortKey === 'New') return a.createdHoursAgo - b.createdHoursAgo;
      if (sortKey === 'Most Liked') return bStats.likePct + bStats.total / 10000 - (aStats.likePct + aStats.total / 10000);
      if (sortKey === 'Most Disliked') {
        return bStats.dislikePct + bStats.total / 10000 - (aStats.dislikePct + aStats.total / 10000);
      }
      if (sortKey === 'Most Divided') {
        return Math.abs(aStats.likePct - 50) - Math.abs(bStats.likePct - 50);
      }
      if (sortKey === 'Most Commented') return b.comments - a.comments;
      return hotScore(b) - hotScore(a);
    });
  }, [activeCategory, issues, query, sortKey]);

  const persistIssues = (next: Issue[]) => {
    setIssues(next);
    writeJson('globalpulse:issues', next);
  };

  const persistReactions = (next: Record<string, Reaction | undefined>) => {
    setReactions(next);
    writeJson('globalpulse:reactions', next);
  };

  const persistComments = (next: Comment[]) => {
    setComments(next);
    writeJson('globalpulse:comments', next);
  };

  const handleReaction = (issueId: string, nextReaction: Reaction) => {
    const previousReaction = reactions[issueId];
    const updatedIssues = issues.map((issue) => {
      if (issue.id !== issueId) return issue;
      let likes = issue.likes;
      let dislikes = issue.dislikes;
      if (previousReaction === 'like') likes = Math.max(0, likes - 1);
      if (previousReaction === 'dislike') dislikes = Math.max(0, dislikes - 1);
      if (previousReaction !== nextReaction) {
        if (nextReaction === 'like') likes += 1;
        if (nextReaction === 'dislike') dislikes += 1;
      }
      return { ...issue, likes, dislikes };
    });
    const optimisticReaction = previousReaction === nextReaction ? undefined : nextReaction;
    persistIssues(updatedIssues);
    persistReactions({ ...reactions, [issueId]: optimisticReaction });

    void requestJson<{
      currentReaction: Reaction | null;
      issueId: string;
      likes: number;
      dislikes: number;
    }>('/api/reactions', {
      method: 'POST',
      body: JSON.stringify({ issueId, reactionType: nextReaction, anonymousToken }),
    }).then((data) => {
      if (!data) return;
      setApiOnline(true);
      const nextIssues = updatedIssues.map((issue) =>
        issue.id === issueId ? { ...issue, likes: data.likes, dislikes: data.dislikes } : issue,
      );
      persistIssues(nextIssues);
      persistReactions({
        ...reactions,
        [issueId]: data.currentReaction ?? undefined,
      });
    });
  };

  const closeAuth = () => {
    setAuthOpen(false);
    setAuthStep('details');
    setPendingAuth(null);
    setAuthMessage('');
    setAuthBusy(false);
  };

  const finishLogin = (nextUser: SessionUser, online = false) => {
    setApiOnline(online);
    setUser(nextUser);
    writeJson('globalpulse:user', nextUser);
    closeAuth();
  };

  const loginWithDemoEndpoint = async (auth: PendingAuth) => {
    const data = await requestJson<{
      user: SessionUser;
      wallet: { balance: number };
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(auth),
    });
    if (data) {
      finishLogin(data.user, true);
      return;
    }
    finishLogin(auth, false);
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAuthMessage('');

    if (authStep === 'code' && pendingAuth) {
      const code = String(form.get('code') ?? '').trim();
      if (!code) return;
      setAuthBusy(true);
      void requestJson<{
        user: SessionUser;
        wallet: { balance: number };
      }>('/api/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email: pendingAuth.email, code }),
      }).then((data) => {
        setAuthBusy(false);
        if (!data) {
          setAuthMessage('인증 코드가 맞지 않거나 만료되었습니다.');
          return;
        }
        finishLogin(data.user, true);
      });
      return;
    }

    const email = String(form.get('email') ?? '').trim();
    const displayName = String(form.get('displayName') ?? '').trim() || 'Global member';
    const countryCode = String(form.get('countryCode') ?? 'KR').trim().toUpperCase().slice(0, 2) || 'KR';
    const auth = { email, displayName, countryCode };
    if (!email) return;

    setAuthBusy(true);
    void requestJson<{
      status: 'code_sent' | 'demo_available';
      expiresInMinutes?: number;
      codeRequired?: boolean;
    }>('/api/auth/request-code', {
      method: 'POST',
      body: JSON.stringify(auth),
    }).then((data) => {
      if (data?.status === 'code_sent') {
        setAuthBusy(false);
        setPendingAuth(auth);
        setAuthStep('code');
        setAuthMessage(`인증 코드가 이메일로 전송되었습니다. ${data.expiresInMinutes ?? 10}분 안에 입력하세요.`);
        return;
      }
      if (!data && apiOnline) {
        setAuthBusy(false);
        setAuthMessage('이메일 인증 설정이 아직 완료되지 않았습니다.');
        return;
      }
      void loginWithDemoEndpoint(auth).finally(() => setAuthBusy(false));
    });
  };

  const handleLogout = () => {
    if (user?.sessionToken) {
      void requestJson<{ revoked: boolean }>('/api/auth/logout', {
        method: 'POST',
        headers: authHeaders(user),
      });
    }
    setUser(null);
    localStorage.removeItem('globalpulse:user');
  };

  const handleComment = (event: FormEvent<HTMLFormElement>, issueId: string) => {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    const content = String(form.get('comment') ?? '').trim();
    if (!content) return;

    if (user.sessionToken) {
      const formElement = event.currentTarget;
      void requestJson<{
        comment?: Comment;
      }>('/api/comments', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({
          issueId,
          content,
          idempotencyKey: crypto.randomUUID(),
        }),
      }).then((data) => {
        if (!data?.comment) return;
        setApiOnline(true);
        const nextComments = [data.comment, ...comments];
        const nextIssues = issues.map((issue) =>
          issue.id === issueId ? { ...issue, comments: issue.comments + 1 } : issue,
        );
        persistComments(nextComments);
        persistIssues(nextIssues);
        formElement.reset();
      });
      return;
    }

    const comment: Comment = {
      id: crypto.randomUUID(),
      issueId,
      userId: user.id ?? user.email,
      author: user.displayName,
      content,
      cost: freeCommentCost,
      createdAt: new Date().toISOString(),
      status: 'visible',
    };
    const nextComments = [comment, ...comments];
    const nextIssues = issues.map((issue) =>
      issue.id === issueId ? { ...issue, comments: issue.comments + 1 } : issue,
    );

    persistComments(nextComments);
    persistIssues(nextIssues);
    event.currentTarget.reset();
  };

  const handleReportComment = (commentId: string) => {
    void requestJson<{ reportId: string; status: 'received' }>('/api/comment-reports', {
      method: 'POST',
      body: JSON.stringify({
        commentId,
        anonymousToken,
        reason: 'policy_review',
      }),
    }).then((data) => {
      if (!data) return;
      setApiOnline(true);
      const nextComments = comments.map((comment) =>
        comment.id === commentId ? { ...comment, status: 'reported' as const } : comment,
      );
      persistComments(nextComments);
    });
  };

  const handleDeleteComment = (commentId: string, issueId: string) => {
    const removeCommentLocally = () => {
      const nextComments = comments.filter((comment) => comment.id !== commentId);
      const nextIssues = issues.map((issue) =>
        issue.id === issueId ? { ...issue, comments: Math.max(0, issue.comments - 1) } : issue,
      );
      persistComments(nextComments);
      persistIssues(nextIssues);
    };

    if (!user?.sessionToken) {
      removeCommentLocally();
      return;
    }

    void requestJson<{ deleted: boolean }>(
      `/api/comments?commentId=${encodeURIComponent(commentId)}`,
      {
        method: 'DELETE',
        headers: authHeaders(user),
      },
    ).then((data) => {
      if (!data?.deleted) return;
      setApiOnline(true);
      removeCommentLocally();
    });
  };

  const handleModerationToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = String(form.get('moderationToken') ?? '').trim();
    if (!token) return;
    setModerationToken(token);
    localStorage.setItem('globalpulse:moderation-token', token);
    setModerationStatus('open');
    setModerationMessage('');
  };

  const clearModerationToken = () => {
    setModerationToken('');
    setModerationReports([]);
    setRuntimeStatus(null);
    setModerationMessage('');
    localStorage.removeItem('globalpulse:moderation-token');
  };

  const handleModerationAction = (action: ModerationAction, report: ModerationReport) => {
    if (!moderationToken) return;
    setModerationBusy(true);
    setModerationMessage('');
    void requestJson<{
      commentId: string;
      action: ModerationAction;
      commentStatus: Comment['status'];
    }>('/api/moderation/reports', {
      method: 'PATCH',
      headers: moderationHeaders(moderationToken),
      body: JSON.stringify({
        action,
        commentId: report.commentId,
        note: `Reviewed in GlobalPulse ops panel`,
      }),
    }).then((data) => {
      setModerationBusy(false);
      if (!data) {
        setModerationMessage('검토 액션을 저장하지 못했습니다.');
        return;
      }
      setApiOnline(true);
      const nextStatus = data.commentStatus;
      setComments((currentComments) => {
        const nextComments = currentComments.map((comment) =>
          comment.id === data.commentId ? { ...comment, status: nextStatus } : comment,
        );
        writeJson('globalpulse:comments', nextComments);
        return nextComments;
      });
      setModerationReports((currentReports) =>
        currentReports
          .map((item) =>
            item.commentId === data.commentId
              ? {
                  ...item,
                  commentStatus: nextStatus,
                  openReportCount: 0,
                  review: {
                    action: data.action,
                    note: 'Reviewed in GlobalPulse ops panel',
                    reviewedAt: new Date().toISOString(),
                  },
                }
              : item,
          )
          .filter((item) => moderationStatus !== 'open' || item.commentId !== data.commentId),
      );
      setModerationMessage(`${report.issueTitle} 댓글 검토가 저장되었습니다.`);
    });
  };

  const handleIssueRefresh = () => {
    if (!moderationToken) return;
    setIssueRefreshBusy(true);
    setModerationMessage('');
    void requestJson<IssueRefreshResult>('/api/admin/refresh-issues', {
      method: 'POST',
      headers: moderationHeaders(moderationToken),
    }).then((data) => {
      if (!data) {
        setIssueRefreshBusy(false);
        setModerationMessage('공개 이슈 갱신에 실패했습니다. 운영 토큰과 배포 설정을 확인하세요.');
        return;
      }
      setApiOnline(true);
      void requestJson<{ issues: Issue[] }>('/api/issues').then((issueData) => {
        if (issueData?.issues?.length) {
          persistIssues(issueData.issues);
        }
        void requestJson<RuntimeStatus>('/api/admin/status', {
          headers: moderationHeaders(moderationToken),
        }).then((statusData) => {
          if (statusData) setRuntimeStatus(statusData);
          setIssueRefreshBusy(false);
          setModerationMessage(
            `공개 이슈 갱신 완료: ${data.upserted}개 저장, Wikimedia ${data.sources.wikimedia}개, Hacker News ${data.sources.hackerNews}개, GDELT ${data.sources.gdelt}개.`,
          );
        });
      });
    });
  };

  const visibleComments = comments.filter(
    (comment) =>
      comment.issueId === activeIssueId && comment.status !== 'deleted' && comment.status !== 'hidden',
  );

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070A12]/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl flex-col items-stretch gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <button className="flex items-center gap-2" onClick={() => setView('feed')}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 text-slate-950">
              <Globe2 className="h-5 w-5" />
            </span>
            <span className="text-left">
              <span className="block text-lg font-black tracking-tight">GlobalPulse</span>
              <span className="block text-[11px] uppercase tracking-[0.24em] text-cyan-200/70">neutral reaction feed</span>
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button className="nav-pill" onClick={() => setView('about')}>
              About
            </button>
            <button className="nav-pill" onClick={() => setView('policy')}>
              Policy
            </button>
            <button className="nav-pill" onClick={() => setView('moderation')}>
              <ShieldAlert className="h-4 w-4" />
              Ops
            </button>
            {user ? (
              <button className="nav-pill" onClick={handleLogout} title={user.email}>
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{user.displayName}</span>
              </button>
            ) : (
              <button className="nav-pill bg-cyan-400 text-slate-950" onClick={() => setAuthOpen(true)}>
                <LogIn className="h-4 w-4" />
                Login
              </button>
            )}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-5">
        {view === 'feed' ? (
          <>
            <section className="mb-5 grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_34%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(2,6,23,0.96))] p-5 shadow-2xl shadow-cyan-950/30 sm:p-7">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">
                  <Flame className="h-4 w-4" />
                  Anonymous global reaction
                </div>
                <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
                  전 세계 이슈 반응을 한눈에 보는 중립형 트렌드 대시보드
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  GlobalPulse는 어떤 이슈의 정답을 단정하지 않고, 익명 반응과 로그인 댓글 흐름을 분리해 보여줍니다.
                </p>
              </div>
              <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Live sample</p>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <Metric label="Issues" value={issues.length.toString()} />
                  <Metric label="Reactions" value={formatCount(issues.reduce((sum, issue) => sum + issue.likes + issue.dislikes, 0))} />
                  <Metric label="Comments" value={formatCount(issues.reduce((sum, issue) => sum + issue.comments, 0))} />
                </div>
                <p className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
                  결제 기능은 제거되었습니다. 로그인 사용자는 별도 충전 없이 무료로 댓글을 작성할 수 있습니다.
                </p>
                <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-slate-400">
                  Data mode: {apiOnline ? 'D1 API connected' : 'local fallback'}
                </p>
              </aside>
            </section>

            <section className="sticky top-[65px] z-30 mb-4 rounded-3xl border border-white/10 bg-[#070A12]/90 p-3 backdrop-blur">
              <label className="mb-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <Search className="h-5 w-5 text-slate-400" />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
                  placeholder="Search global issues"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
                {(['All', ...categories] as const).map((category) => (
                  <button
                    className={`filter-chip ${activeCategory === category ? 'filter-chip-active' : ''}`}
                    key={category}
                    onClick={() => setActiveCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {sortTabs.map((tab) => (
                  <button
                    className={`sort-tab ${sortKey === tab ? 'sort-tab-active' : ''}`}
                    key={tab}
                    onClick={() => setSortKey(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              {filteredIssues.map((issue) => (
                <IssueCard
                  issue={issue}
                  key={issue.id}
                  reaction={reactions[issue.id]}
                  onOpen={() => setActiveIssueId(issue.id)}
                  onReact={handleReaction}
                />
              ))}
              {!filteredIssues.length ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-slate-300">
                  검색 조건에 맞는 이슈가 없습니다.
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        {view === 'about' ? <InfoPage type="about" /> : null}
        {view === 'policy' ? <InfoPage type="policy" /> : null}
        {view === 'moderation' ? (
          <ModerationView
            busy={moderationBusy}
            issueRefreshBusy={issueRefreshBusy}
            message={moderationMessage}
            onAction={handleModerationAction}
            onClearToken={clearModerationToken}
            onIssueRefresh={handleIssueRefresh}
            onStatusChange={setModerationStatus}
            onTokenSubmit={handleModerationToken}
            reports={moderationReports}
            runtimeStatus={runtimeStatus}
            status={moderationStatus}
            tokenConfigured={Boolean(moderationToken)}
          />
        ) : null}
      </main>

      {activeIssue ? (
        <IssueModal
          comments={visibleComments}
          issue={activeIssue}
          onClose={() => setActiveIssueId(null)}
          onComment={handleComment}
          onDeleteComment={handleDeleteComment}
          onLogin={() => setAuthOpen(true)}
          onReact={handleReaction}
          onReportComment={handleReportComment}
          reaction={reactions[activeIssue.id]}
          user={user}
        />
      ) : null}

      {authOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <form className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101827] p-5 shadow-2xl" onSubmit={handleLogin}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-black">Login</h2>
              <button type="button" onClick={closeAuth} aria-label="닫기">
                <X className="h-5 w-5" />
              </button>
            </div>
            {authStep === 'details' ? (
              <>
                <label className="form-label">
                  Email
                  <input className="form-input" name="email" type="email" required placeholder="you@example.com" />
                </label>
                <label className="form-label">
                  Display name
                  <input className="form-input" name="displayName" placeholder="Pulse reader" />
                </label>
                <label className="form-label">
                  Country code
                  <input
                    className="form-input uppercase"
                    defaultValue="KR"
                    inputMode="text"
                    maxLength={2}
                    name="countryCode"
                    pattern="[A-Za-z]{2}"
                    placeholder="KR"
                    required
                  />
                </label>
              </>
            ) : (
              <>
                <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-300">
                  <span className="block text-xs uppercase tracking-[0.16em] text-slate-500">Email</span>
                  <span className="font-bold">{pendingAuth?.email}</span>
                </div>
                <label className="form-label">
                  Verification code
                  <input
                    className="form-input"
                    inputMode="numeric"
                    maxLength={6}
                    name="code"
                    pattern="[0-9]{6}"
                    placeholder="123456"
                    required
                  />
                </label>
              </>
            )}
            {authMessage ? (
              <p className="mb-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm leading-6 text-cyan-100">
                {authMessage}
              </p>
            ) : null}
            <p className="mb-4 text-xs leading-5 text-slate-400">
              프로덕션에서는 이메일 인증 코드를 확인한 뒤 서버 세션을 발급합니다. 로컬 데모에서는 서버 설정에 따라 즉시 로그인할 수 있습니다.
            </p>
            <button className="primary-button w-full disabled:opacity-60" disabled={authBusy} type="submit">
              {authBusy ? 'Processing' : authStep === 'code' ? 'Verify code' : 'Continue'}
            </button>
            {authStep === 'code' ? (
              <button
                className="mt-3 w-full text-sm font-bold text-slate-400 transition hover:text-white"
                onClick={() => {
                  setAuthStep('details');
                  setPendingAuth(null);
                  setAuthMessage('');
                }}
                type="button"
              >
                다른 이메일 사용
              </button>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
    </div>
  );
}

function IssueCard({
  issue,
  reaction,
  onOpen,
  onReact,
}: {
  issue: Issue;
  reaction?: Reaction;
  onOpen: () => void;
  onReact: (issueId: string, reaction: Reaction) => void;
}) {
  const stats = getReactionStats(issue);
  const badge = getBadge(issue);

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-cyan-300/40 hover:bg-white/[0.06]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-cyan-300 px-2.5 py-1 text-xs font-black text-slate-950">{issue.category}</span>
        <span className="badge">{badge}</span>
        {issue.sensitive ? (
          <span className="badge border-amber-300/30 bg-amber-300/10 text-amber-100">Context-dependent</span>
        ) : null}
      </div>
      <button className="block w-full text-left" onClick={onOpen}>
        <h2 className="text-xl font-black leading-snug sm:text-2xl">{issue.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{issue.summary}</p>
      </button>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-4 w-4" />
          {issue.createdHoursAgo}h ago
        </span>
        <span>{issue.sourceCount} sources</span>
        <span>{formatCount(stats.total)} anonymous reactions</span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="h-4 w-4" />
          {formatCount(issue.comments)}
        </span>
      </div>
      <ReactionBar stats={stats} />
      <div className="mt-4 flex items-center gap-2">
        <button className={`reaction-button ${reaction === 'like' ? 'reaction-like-active' : ''}`} onClick={() => onReact(issue.id, 'like')}>
          <ThumbsUp className="h-4 w-4" />
          Like
        </button>
        <button className={`reaction-button ${reaction === 'dislike' ? 'reaction-dislike-active' : ''}`} onClick={() => onReact(issue.id, 'dislike')}>
          <ThumbsDown className="h-4 w-4" />
          Dislike
        </button>
        <button className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-cyan-200" onClick={onOpen}>
          Detail
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">Anonymous global reaction</p>
    </article>
  );
}

function ReactionBar({ stats }: { stats: ReturnType<typeof getReactionStats> }) {
  if (!stats.total) {
    return <p className="mt-4 rounded-full bg-white/[0.04] px-4 py-3 text-sm text-slate-400">Be first to react</p>;
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between text-sm font-black">
        <span className="text-emerald-200">좋아요 {stats.likePct}%</span>
        <span className="text-rose-200">싫어요 {stats.dislikePct}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-rose-400/80">
        <div className="h-full rounded-full bg-emerald-300" style={{ width: `${stats.likePct}%` }} />
      </div>
    </div>
  );
}

function IssueModal({
  issue,
  reaction,
  comments,
  user,
  onClose,
  onReact,
  onComment,
  onDeleteComment,
  onLogin,
  onReportComment,
}: {
  issue: Issue;
  reaction?: Reaction;
  comments: Comment[];
  user: SessionUser | null;
  onClose: () => void;
  onReact: (issueId: string, reaction: Reaction) => void;
  onComment: (event: FormEvent<HTMLFormElement>, issueId: string) => void;
  onDeleteComment: (commentId: string, issueId: string) => void;
  onLogin: () => void;
  onReportComment: (commentId: string) => void;
}) {
  const stats = getReactionStats(issue);
  const canComment = Boolean(user);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-0 sm:p-4">
      <div className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden bg-[#0D1321] sm:rounded-3xl sm:border sm:border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">{issue.category}</p>
            <h2 className="mt-1 text-xl font-black sm:text-3xl">{issue.title}</h2>
          </div>
          <button className="rounded-full border border-white/10 p-2" onClick={onClose} aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-300">{issue.detail}</p>
          {issue.sensitive ? (
            <p className="mt-3 flex gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              This issue may be complex and context-dependent.
            </p>
          ) : null}
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-black">Anonymous global reaction</p>
              <span className="text-sm text-slate-400">{formatCount(stats.total)} reactions</span>
            </div>
            <ReactionBar stats={stats} />
            <div className="mt-4 flex gap-2">
              <button className={`reaction-button ${reaction === 'like' ? 'reaction-like-active' : ''}`} onClick={() => onReact(issue.id, 'like')}>
                <ThumbsUp className="h-4 w-4" />
                Like
              </button>
              <button className={`reaction-button ${reaction === 'dislike' ? 'reaction-dislike-active' : ''}`} onClick={() => onReact(issue.id, 'dislike')}>
                <ThumbsDown className="h-4 w-4" />
                Dislike
              </button>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="mb-3 font-black">Sources</p>
            <div className="grid gap-2">
              {issue.sources.map((source) => (
                <a className="rounded-xl border border-white/10 px-3 py-2 text-sm text-cyan-200" href={source.url} key={source.url} target="_blank">
                  {source.name}
                </a>
              ))}
            </div>
          </div>
          <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-black">Comments</h3>
              <span className="text-sm text-slate-400">{comments.length} visible</span>
            </div>
            {!user ? (
              <button className="primary-button w-full" onClick={onLogin}>
                Login to write a comment
              </button>
            ) : (
              <form className="grid gap-3" onSubmit={(event) => onComment(event, issue.id)}>
                <textarea className="form-input min-h-24" name="comment" maxLength={500} placeholder="의견을 입력하세요" required />
                <p className="text-xs text-slate-400">댓글 작성은 무료입니다. 댓글은 사실성이나 신뢰도를 의미하지 않습니다.</p>
                <button className="primary-button" disabled={!canComment}>
                  Comment
                </button>
              </form>
            )}
            <p className="mt-4 flex gap-2 text-xs leading-5 text-slate-500">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              욕설, 혐오, 개인정보 노출, 불법 콘텐츠를 줄이기 위해 신고와 운영 검토가 필요합니다.
            </p>
            <div className="mt-4 grid gap-3">
              {comments.map((comment) => (
                <div className="rounded-2xl border border-white/10 bg-[#070A12] p-3" key={comment.id}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{comment.author}</span>
                      {comment.status === 'reported' ? (
                        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[11px] font-bold text-amber-100">
                          Reported
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-slate-500">free</span>
                  </div>
                  <p className="text-sm leading-6 text-slate-300">{comment.content}</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      className="text-xs font-bold text-amber-200 disabled:text-slate-600"
                      disabled={comment.status === 'reported'}
                      onClick={() => onReportComment(comment.id)}
                    >
                      {comment.status === 'reported' ? 'Reported' : 'Report'}
                    </button>
                    {user && comment.userId && comment.userId === (user.id ?? user.email) ? (
                      <button
                        className="text-xs font-bold text-rose-200"
                        onClick={() => onDeleteComment(comment.id, comment.issueId)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!comments.length ? <p className="text-sm text-slate-500">아직 댓글이 없습니다.</p> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ModerationView({
  tokenConfigured,
  reports,
  runtimeStatus,
  status,
  busy,
  issueRefreshBusy,
  message,
  onTokenSubmit,
  onClearToken,
  onStatusChange,
  onIssueRefresh,
  onAction,
}: {
  tokenConfigured: boolean;
  reports: ModerationReport[];
  runtimeStatus: RuntimeStatus | null;
  status: ModerationStatus;
  busy: boolean;
  issueRefreshBusy: boolean;
  message: string;
  onTokenSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClearToken: () => void;
  onStatusChange: (status: ModerationStatus) => void;
  onIssueRefresh: () => void;
  onAction: (action: ModerationAction, report: ModerationReport) => void;
}) {
  const openCount = reports.reduce((sum, report) => sum + report.openReportCount, 0);

  return (
    <section className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-4 flex items-center gap-2 text-amber-100">
          <ShieldAlert className="h-6 w-6" />
          <h1 className="text-2xl font-black">Moderation ops</h1>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Reports" value={reports.length.toString()} />
          <Metric label="Open" value={openCount.toString()} />
        </div>
        {tokenConfigured ? (
          <button className="mt-4 w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-slate-300 transition hover:border-rose-300/40 hover:text-rose-100" onClick={onClearToken}>
            Forget token
          </button>
        ) : (
          <form className="mt-4" onSubmit={onTokenSubmit}>
            <label className="form-label">
              Admin token
              <input
                className="form-input"
                name="moderationToken"
                placeholder="MODERATION_ADMIN_TOKEN"
                required
                type="password"
              />
            </label>
            <button className="primary-button w-full" type="submit">
              Open queue
            </button>
          </form>
        )}
        <div className="mt-5 border-t border-white/10 pt-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Issue sources</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Wikimedia Current Events, Hacker News, GDELT 공개 데이터를 D1 이슈 목록에 갱신합니다.
          </p>
          <button
            className="primary-button mt-4 w-full"
            disabled={!tokenConfigured || issueRefreshBusy}
            onClick={onIssueRefresh}
            type="button"
          >
            <RotateCcw className={`h-4 w-4 ${issueRefreshBusy ? 'animate-spin' : ''}`} />
            {issueRefreshBusy ? 'Refreshing issues' : 'Refresh public issues'}
          </button>
        </div>
        <OpsRuntimeStatus runtimeStatus={runtimeStatus} tokenConfigured={tokenConfigured} />
        {message ? (
          <p className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm leading-6 text-cyan-100">
            {message}
          </p>
        ) : null}
      </aside>

      <div className="grid gap-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {(['open', 'reviewed', 'all'] as const).map((item) => (
              <button
                className={`sort-tab ${status === item ? 'sort-tab-active' : ''}`}
                disabled={!tokenConfigured || busy}
                key={item}
                onClick={() => onStatusChange(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          {reports.map((report) => (
            <ModerationReportCard
              busy={busy}
              key={report.commentId}
              onAction={onAction}
              report={report}
            />
          ))}
          {tokenConfigured && !busy && !reports.length ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-slate-400">
              이 필터에 해당하는 신고 댓글이 없습니다.
            </div>
          ) : null}
          {tokenConfigured && busy ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-slate-400">
              모더레이션 큐를 불러오는 중입니다.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function OpsRuntimeStatus({
  runtimeStatus,
  tokenConfigured,
}: {
  runtimeStatus: RuntimeStatus | null;
  tokenConfigured: boolean;
}) {
  const emailReady = Boolean(
    runtimeStatus?.auth.provider === 'resend' &&
      runtimeStatus.auth.resendConfigured &&
      runtimeStatus.auth.emailFromConfigured &&
      !runtimeStatus.auth.logDeliveryEnabled,
  );
  const runtimeReady = Boolean(
    runtimeStatus?.config.sessionSecretConfigured &&
      runtimeStatus.config.moderationAdminTokenConfigured &&
      runtimeStatus.config.appPublicOriginConfigured &&
      runtimeStatus.config.appPublicOriginHttps &&
      runtimeStatus.config.appPublicOriginMatchesRequest &&
      !runtimeStatus.config.demoLoginEnabled,
  );
  const d1Ready = Boolean(runtimeStatus && runtimeStatus.d1.issueCount >= 20);
  const d1SchemaReady = Boolean(runtimeStatus?.d1.requiredTablesPresent);
  const paymentsDisabled = Boolean(
    runtimeStatus &&
      runtimeStatus.payments.activePlanCount === 0 &&
      runtimeStatus.payments.legacySecretCount === 0,
  );
  const launchReady = Boolean(runtimeStatus?.config.launchReviewAcknowledged);
  const launchBlockers = runtimeStatus ? getLaunchBlockers(runtimeStatus) : [];

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Runtime status</p>
      {!tokenConfigured ? (
        <p className="mt-2 text-sm leading-6 text-slate-400">운영 토큰을 입력하면 배포 설정 상태를 확인할 수 있습니다.</p>
      ) : null}
      {tokenConfigured && !runtimeStatus ? (
        <p className="mt-2 text-sm leading-6 text-slate-400">런타임 상태를 불러오는 중입니다.</p>
      ) : null}
      {runtimeStatus ? (
        <div className="mt-3 grid gap-2">
          <OpsStatusLine label={`D1 issues ${runtimeStatus.d1.issueCount}`} ok={d1Ready} />
          <OpsStatusLine label={`D1 schema tables ${runtimeStatus.d1.requiredTableCount}`} ok={d1SchemaReady} />
          <OpsStatusLine label="Resend email login" ok={emailReady} />
          <OpsStatusLine label="Public origin matches deploy" ok={Boolean(runtimeStatus.config.appPublicOriginMatchesRequest)} />
          <OpsStatusLine label="Runtime secrets" ok={runtimeReady} />
          <OpsStatusLine label="Payments disabled" ok={paymentsDisabled} />
          <OpsStatusLine label={`Legacy payment secrets ${runtimeStatus.payments.legacySecretCount}`} ok={runtimeStatus.payments.legacySecretCount === 0} />
          <OpsStatusLine label="Launch review ACK" ok={launchReady} />
          {launchBlockers.length ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100">Remaining launch blockers</p>
              <ul className="mt-2 grid gap-1 text-xs leading-5 text-amber-50/90">
                {launchBlockers.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs font-black text-emerald-100">
              Runtime launch gates are clear.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function getLaunchBlockers(runtimeStatus: RuntimeStatus): string[] {
  const blockers: string[] = [];

  if (runtimeStatus.d1.issueCount < 20) {
    blockers.push(`D1 needs at least 20 issues; current count is ${runtimeStatus.d1.issueCount}.`);
  }
  if (!runtimeStatus.d1.requiredTablesPresent) {
    const missing = runtimeStatus.d1.missingTables.length
      ? runtimeStatus.d1.missingTables.join(', ')
      : 'unknown tables';
    blockers.push(`D1 schema is missing: ${missing}.`);
  }
  if (runtimeStatus.auth.provider !== 'resend') {
    blockers.push(`AUTH_PROVIDER must be resend; current value is ${runtimeStatus.auth.provider || 'not configured'}.`);
  }
  if (!runtimeStatus.auth.resendConfigured) {
    blockers.push('RESEND_API_KEY is not configured.');
  }
  if (!runtimeStatus.auth.emailFromConfigured) {
    blockers.push('AUTH_EMAIL_FROM is not configured.');
  }
  if (runtimeStatus.auth.logDeliveryEnabled) {
    blockers.push('AUTH_EMAIL_DELIVERY=log must be removed from production.');
  }
  if (!runtimeStatus.config.sessionSecretConfigured) {
    blockers.push('SESSION_TOKEN_SECRET is not configured.');
  }
  if (!runtimeStatus.config.moderationAdminTokenConfigured) {
    blockers.push('MODERATION_ADMIN_TOKEN is not configured.');
  }
  if (!runtimeStatus.config.appPublicOriginConfigured) {
    blockers.push('APP_PUBLIC_ORIGIN is not configured.');
  }
  if (!runtimeStatus.config.appPublicOriginHttps) {
    blockers.push('APP_PUBLIC_ORIGIN must use HTTPS.');
  }
  if (!runtimeStatus.config.appPublicOriginMatchesRequest) {
    blockers.push('APP_PUBLIC_ORIGIN must match this deployment origin.');
  }
  if (runtimeStatus.config.demoLoginEnabled) {
    blockers.push('ALLOW_DEMO_LOGIN must be disabled in production.');
  }
  if (runtimeStatus.payments.activePlanCount !== 0) {
    blockers.push(`Active payment plans must be disabled; current count is ${runtimeStatus.payments.activePlanCount}.`);
  }
  if (runtimeStatus.payments.legacySecretCount !== 0) {
    const names = runtimeStatus.payments.legacySecretsPresent.length
      ? runtimeStatus.payments.legacySecretsPresent.join(', ')
      : 'unknown payment secrets';
    blockers.push(`Remove legacy payment secrets: ${names}.`);
  }
  if (!runtimeStatus.config.launchReviewAcknowledged) {
    blockers.push('Complete LAUNCH_REVIEW.md, then set LAUNCH_REVIEW_ACK.');
  }

  return blockers;
}

function OpsStatusLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-300">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-200" /> : <AlertTriangle className="h-4 w-4 text-amber-200" />}
      <span>{label}</span>
    </div>
  );
}

function ModerationReportCard({
  report,
  busy,
  onAction,
}: {
  report: ModerationReport;
  busy: boolean;
  onAction: (action: ModerationAction, report: ModerationReport) => void;
}) {
  const isHidden = report.commentStatus === 'hidden';
  const isVisible = report.commentStatus === 'visible';

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="badge border-amber-300/30 bg-amber-300/10 text-amber-100">
          {report.openReportCount} open / {report.reportCount} total
        </span>
        <span className="badge">{report.commentStatus}</span>
        {report.review ? <span className="badge">reviewed: {report.review.action}</span> : null}
      </div>
      <h2 className="text-lg font-black leading-snug">{report.issueTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">{report.content}</p>
      <div className="mt-3 grid gap-1 text-xs text-slate-500">
        <p>{report.author.name} · {report.author.email}</p>
        <p>Reported {new Date(report.lastReportedAt).toLocaleString('ko-KR')}</p>
        {report.review?.reviewedAt ? <p>Reviewed {new Date(report.review.reviewedAt).toLocaleString('ko-KR')}</p> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="reaction-button border-rose-300/30 text-rose-100"
          disabled={busy || isHidden}
          onClick={() => onAction('hide', report)}
        >
          <EyeOff className="h-4 w-4" />
          Hide
        </button>
        <button
          className="reaction-button border-emerald-300/30 text-emerald-100"
          disabled={busy || isVisible}
          onClick={() => onAction('restore', report)}
        >
          <RotateCcw className="h-4 w-4" />
          Restore
        </button>
        <button
          className="reaction-button"
          disabled={busy}
          onClick={() => onAction('dismiss', report)}
        >
          <CheckCircle2 className="h-4 w-4" />
          Dismiss
        </button>
      </div>
    </article>
  );
}

function InfoPage({ type }: { type: 'about' | 'policy' }) {
  const isAbout = type === 'about';
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
      <div className="mb-4 flex items-center gap-2 text-cyan-200">
        {isAbout ? <BarChart3 className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
        <h1 className="text-3xl font-black">{isAbout ? 'About GlobalPulse' : 'Operations and refund policy'}</h1>
      </div>
      {isAbout ? (
        <div className="grid gap-4 text-sm leading-6 text-slate-300">
          <p>GlobalPulse는 글로벌 핫이슈에 대한 익명 글로벌 반응을 보여주는 대시보드입니다. 이 서비스는 정답, 사실 확정, 진실 판정을 제공하지 않습니다.</p>
          <p>좋아요/싫어요는 로그인 없이 가능하고, 댓글은 로그인한 사용자가 무료로 작성하는 구조입니다.</p>
          <p>Wikimedia Current Events, Hacker News, GDELT 기반 공개 데이터 갱신 API를 통해 운영자가 이슈를 보강할 수 있습니다.</p>
        </div>
      ) : (
        <div className="grid gap-4 text-sm leading-6 text-slate-300">
          <p>개인정보 처리, 댓글 모더레이션, 신고 대응은 실제 운영 전 운영자가 정책과 절차를 확인해야 합니다.</p>
          <p>Payments are disabled. GlobalPulse does not provide wallet top-ups, paid comments, checkout, Stripe, Toss, or refunds for paid balances.</p>
          <p>GlobalPulse는 카드번호 등 민감한 결제 정보를 수집하거나 저장하지 않습니다.</p>
          <p>댓글은 운영 검토 대상이 될 수 있으며, 신고된 댓글은 숨김, 복원, 기각 처리될 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}
