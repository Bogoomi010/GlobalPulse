INSERT OR IGNORE INTO issues
  (id, title, summary, detail, category, source_count, created_at, hot_score, status_badge, reaction_velocity, is_sensitive)
VALUES
  ('issue-001', 'Multiple capitals debate a new climate finance framework', 'Governments are weighing a proposal that could shift how adaptation funds are distributed.', 'Officials and civic groups are discussing a climate finance framework across several regions. Supporters say the approach could direct aid faster, while critics question oversight and eligibility. The issue remains context-dependent and no single outcome is settled.', 'World', 2, datetime('now', '-1 hours'), 9800, 'Hot', 96, 1),
  ('issue-002', 'Open model benchmarks trigger another AI tooling debate', 'Developers are comparing speed, cost, and reliability after new public benchmark results.', 'The discussion centers on how benchmark results should be interpreted in production contexts. Teams are reacting to cost, latency, safety, and ecosystem tradeoffs rather than treating one benchmark as a final answer.', 'Tech', 2, datetime('now', '-3 hours'), 9400, 'Rising', 91, 0),
  ('issue-003', 'Streaming bundles return as media firms test new pricing', 'Consumers are reacting to bundle discounts, ad tiers, and cancellation rules.', 'Media companies are experimenting with bundle pricing as growth patterns change. Reactions vary between users who want simpler subscriptions and users concerned about lock-in, ads, and hidden costs.', 'Business', 1, datetime('now', '-5 hours'), 7600, 'Mostly Negative', 73, 0),
  ('issue-004', 'A surprise album rollout dominates short-form video trends', 'Clips, fan edits, and chart projections are pushing the release across platforms.', 'The album rollout is spreading through creator clips and fan communities. People are responding to the music, promotion strategy, and platform algorithms that amplify early reactions.', 'Culture', 1, datetime('now', '-2 hours'), 9900, 'Highly Discussed', 98, 0),
  ('issue-005', 'New battery paper draws attention from EV watchers', 'A lab result is raising cautious interest around density, charging speed, and scale.', 'A recently discussed battery result has prompted interest from researchers and EV communities. The main debate is whether promising lab performance can translate into durable and affordable production.', 'Science', 1, datetime('now', '-9 hours'), 6800, 'Mostly Positive', 65, 0),
  ('issue-006', 'Finals officiating discussion splits global basketball fans', 'Fans are arguing over late-game calls, replay standards, and player reactions.', 'Basketball fans are debating officiating standards after a close game. The conversation is highly divided, with many comments focusing on consistency rather than claiming a definitive intent.', 'Sports', 1, datetime('now', '-6 hours'), 8800, 'Divided', 88, 1),
  ('issue-007', 'A browser game meme becomes a workplace productivity joke', 'Screenshots and leaderboards are spreading as teams turn the meme into office banter.', 'A simple browser game trend is being remixed into workplace jokes and leaderboard posts. Reactions are mostly playful, though some users are discussing distraction and platform moderation.', 'Internet', 1, datetime('now', '-4 hours'), 9300, 'Rising', 94, 0),
  ('issue-008', 'City transit pilots free weekend routes amid cost debate', 'Residents are reacting to access gains, budget pressure, and traffic impacts.', 'A free weekend transit pilot is drawing attention from commuters and local businesses. Supporters emphasize access and congestion, while critics focus on costs and long-term funding.', 'World', 1, datetime('now', '-11 hours'), 5700, 'Hot', 58, 0),
  ('issue-009', 'Developers question app store fee changes after new rollout', 'Indie teams and platform watchers are comparing fees, compliance work, and reach.', 'App developers are evaluating a platform policy change. Reactions differ depending on business model, geography, and whether teams expect the new structure to lower or raise operating costs.', 'Tech', 1, datetime('now', '-16 hours'), 6200, 'Mostly Negative', 62, 0),
  ('issue-010', 'Coffee chain tests dynamic pricing in selected markets', 'Customers are responding to time-based offers, app rewards, and fairness concerns.', 'A retail pricing pilot is generating mixed reactions. Some users see it as a way to discount slow periods, while others worry it could normalize confusing or unfair price changes.', 'Business', 1, datetime('now', '-22 hours'), 5900, 'Mostly Negative', 57, 0),
  ('issue-011', 'Film festival lineup sparks genre-versus-prestige debate', 'Viewers are discussing whether popular genre titles are getting more serious attention.', 'A festival lineup has prompted conversation about genre films and awards positioning. The reaction is not about a single right answer, but about changing taste and programming priorities.', 'Culture', 1, datetime('now', '-14 hours'), 5400, 'Mostly Positive', 54, 0),
  ('issue-012', 'Public health dashboard redesign gets mixed reactions', 'Users praise clearer visuals but question how uncertainty is communicated.', 'A public health dashboard redesign is being discussed by data teams and residents. The conversation focuses on clarity, uncertainty, and whether simplified visuals hide important caveats.', 'Science', 1, datetime('now', '-7 hours'), 7000, 'Divided', 69, 1),
  ('issue-013', 'A transfer rumor pushes football forums into watch mode', 'Fans are parsing agent comments, club finances, and tactical fit.', 'A transfer rumor is moving through fan communities. Reactions are shaped by club loyalty, source credibility, and whether the player would fit the current squad structure.', 'Sports', 1, datetime('now', '-19 hours'), 6100, 'Mostly Positive', 61, 0),
  ('issue-014', 'Creator platform policy update divides moderators', 'Communities are reacting to enforcement details and appeal timelines.', 'A creator platform policy update has generated moderator discussion. Supporters point to clearer rules, while critics are concerned about enforcement, appeals, and edge cases.', 'Internet', 1, datetime('now', '-12 hours'), 8300, 'Divided', 82, 1),
  ('issue-015', 'Regional food shortage alerts lead to logistics debate', 'Aid groups, governments, and residents are discussing delivery routes and pricing.', 'Food shortage alerts are prompting discussion about supply chains and humanitarian logistics. The issue may be complex and context-dependent, with local conditions shaping reactions.', 'World', 1, datetime('now', '-28 hours'), 4600, 'Divided', 45, 1),
  ('issue-016', 'New handheld console leak starts battery-life argument', 'Gamers are comparing portability, display quality, thermal limits, and price.', 'A handheld console leak has started a familiar hardware debate. Users are reacting to rumored specs while acknowledging that unconfirmed details can change before launch.', 'Tech', 1, datetime('now', '-31 hours'), 5200, 'Mostly Positive', 53, 0),
  ('issue-017', 'Airline baggage subscription idea faces customer pushback', 'Travelers are reacting to convenience claims, fee fatigue, and refund questions.', 'An airline baggage subscription concept is being discussed by travelers. Reactions are mostly negative around fee complexity, though some frequent travelers see possible convenience.', 'Business', 1, datetime('now', '-36 hours'), 5000, 'Mostly Negative', 49, 0),
  ('issue-018', 'Museum night program trends with younger visitors', 'Extended hours, live sets, and lower ticket bundles are drawing attention.', 'A museum night program is gaining attention through social clips and local press. Reactions are mostly positive, with some discussion about crowding and access.', 'Culture', 1, datetime('now', '-42 hours'), 3800, 'Mostly Positive', 37, 0),
  ('issue-019', 'Ocean cleanup robot footage spreads beyond science circles', 'Viewers are weighing visible progress against scale, cost, and ecological concerns.', 'Footage of an ocean cleanup robot has spread across platforms. Users are reacting to the visuals, while experts and observers point to scale and ecosystem tradeoffs.', 'Science', 1, datetime('now', '-47 hours'), 4300, 'Mostly Positive', 41, 0),
  ('issue-020', 'Viral spreadsheet template becomes a personal finance trend', 'Users are sharing budgets, savings dashboards, and debates over public money diaries.', 'A spreadsheet template has become a personal finance trend. Reactions are positive around clarity and habit building, with privacy concerns around public sharing.', 'Internet', 1, datetime('now', '-54 hours'), 4400, 'Mostly Positive', 44, 0);

UPDATE issues SET seed_like_count = 18420, seed_dislike_count = 6320, seed_comment_count = 342 WHERE id = 'issue-001';
UPDATE issues SET seed_like_count = 22100, seed_dislike_count = 8900, seed_comment_count = 611 WHERE id = 'issue-002';
UPDATE issues SET seed_like_count = 8300, seed_dislike_count = 11200, seed_comment_count = 201 WHERE id = 'issue-003';
UPDATE issues SET seed_like_count = 41500, seed_dislike_count = 5100, seed_comment_count = 1204 WHERE id = 'issue-004';
UPDATE issues SET seed_like_count = 12600, seed_dislike_count = 2800, seed_comment_count = 184 WHERE id = 'issue-005';
UPDATE issues SET seed_like_count = 14100, seed_dislike_count = 13950, seed_comment_count = 890 WHERE id = 'issue-006';
UPDATE issues SET seed_like_count = 30200, seed_dislike_count = 3700, seed_comment_count = 532 WHERE id = 'issue-007';
UPDATE issues SET seed_like_count = 9200, seed_dislike_count = 4100, seed_comment_count = 166 WHERE id = 'issue-008';
UPDATE issues SET seed_like_count = 7800, seed_dislike_count = 9900, seed_comment_count = 377 WHERE id = 'issue-009';
UPDATE issues SET seed_like_count = 5100, seed_dislike_count = 14500, seed_comment_count = 298 WHERE id = 'issue-010';
UPDATE issues SET seed_like_count = 11500, seed_dislike_count = 3400, seed_comment_count = 219 WHERE id = 'issue-011';
UPDATE issues SET seed_like_count = 7600, seed_dislike_count = 7200, seed_comment_count = 153 WHERE id = 'issue-012';
UPDATE issues SET seed_like_count = 9800, seed_dislike_count = 2100, seed_comment_count = 431 WHERE id = 'issue-013';
UPDATE issues SET seed_like_count = 13200, seed_dislike_count = 12800, seed_comment_count = 711 WHERE id = 'issue-014';
UPDATE issues SET seed_like_count = 6800, seed_dislike_count = 6400, seed_comment_count = 244 WHERE id = 'issue-015';
UPDATE issues SET seed_like_count = 16400, seed_dislike_count = 4900, seed_comment_count = 388 WHERE id = 'issue-016';
UPDATE issues SET seed_like_count = 3900, seed_dislike_count = 17800, seed_comment_count = 305 WHERE id = 'issue-017';
UPDATE issues SET seed_like_count = 8700, seed_dislike_count = 900, seed_comment_count = 88 WHERE id = 'issue-018';
UPDATE issues SET seed_like_count = 15100, seed_dislike_count = 3100, seed_comment_count = 198 WHERE id = 'issue-019';
UPDATE issues SET seed_like_count = 10900, seed_dislike_count = 2200, seed_comment_count = 276 WHERE id = 'issue-020';

INSERT OR IGNORE INTO issue_sources
  (id, issue_id, source_name, source_url)
VALUES
  ('source-001-a', 'issue-001', 'Global wire brief', 'https://example.com/climate-brief'),
  ('source-001-b', 'issue-001', 'Policy tracker', 'https://example.com/policy-tracker'),
  ('source-002-a', 'issue-002', 'Developer forum digest', 'https://example.com/ai-benchmarks'),
  ('source-002-b', 'issue-002', 'Research roundup', 'https://example.com/model-roundup'),
  ('source-003-a', 'issue-003', 'Market note', 'https://example.com/streaming-bundles'),
  ('source-004-a', 'issue-004', 'Culture pulse', 'https://example.com/album-trend'),
  ('source-005-a', 'issue-005', 'Science digest', 'https://example.com/battery-paper'),
  ('source-006-a', 'issue-006', 'Sports wire', 'https://example.com/finals-calls'),
  ('source-007-a', 'issue-007', 'Internet trend desk', 'https://example.com/browser-game-meme'),
  ('source-008-a', 'issue-008', 'Urban policy note', 'https://example.com/transit-pilot'),
  ('source-009-a', 'issue-009', 'Platform policy digest', 'https://example.com/app-store-fees'),
  ('source-010-a', 'issue-010', 'Retail brief', 'https://example.com/dynamic-coffee'),
  ('source-011-a', 'issue-011', 'Festival tracker', 'https://example.com/festival-lineup'),
  ('source-012-a', 'issue-012', 'Data civic lab', 'https://example.com/health-dashboard'),
  ('source-013-a', 'issue-013', 'Transfer watch', 'https://example.com/transfer-rumor'),
  ('source-014-a', 'issue-014', 'Creator economy digest', 'https://example.com/mod-policy'),
  ('source-015-a', 'issue-015', 'Relief operations brief', 'https://example.com/food-logistics'),
  ('source-016-a', 'issue-016', 'Hardware watch', 'https://example.com/handheld-leak'),
  ('source-017-a', 'issue-017', 'Travel market note', 'https://example.com/baggage-plan'),
  ('source-018-a', 'issue-018', 'City culture note', 'https://example.com/museum-night'),
  ('source-019-a', 'issue-019', 'Ocean tech digest', 'https://example.com/ocean-robot'),
  ('source-020-a', 'issue-020', 'Internet money diary', 'https://example.com/spreadsheet-finance');
