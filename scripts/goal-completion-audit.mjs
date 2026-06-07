import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const launchReviewPath = path.join(root, 'LAUNCH_REVIEW.md');
const requireComplete = process.argv.includes('--require-complete');
const jsonOutput = process.argv.includes('--json');

const launchReview = fs.readFileSync(launchReviewPath, 'utf8');
const items = parseChecklist(launchReview);
const remaining = items.filter((item) => !item.done);
const completed = items.filter((item) => item.done);

const result = {
  completed: completed.length,
  generated: new Date().toISOString(),
  remaining: remaining.length,
  status: remaining.length ? 'incomplete' : 'complete',
  remainingItems: remaining,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printTextReport(result);
}

if (requireComplete && remaining.length) {
  process.exit(1);
}

function parseChecklist(markdown) {
  const parsed = [];
  let section = 'General';

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^#{2,3}\s+(.+)$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }

    const checklist = line.match(/^-\s+\[(x| )]\s+(.+)$/i);
    if (!checklist) continue;

    parsed.push({
      done: checklist[1].toLowerCase() === 'x',
      section,
      text: checklist[2].trim(),
    });
  }

  return parsed;
}

function printTextReport(report) {
  const lines = [
    'GlobalPulse goal completion audit',
    `Generated: ${report.generated}`,
    `Status: ${report.status.toUpperCase()}`,
    `Completed checklist items: ${report.completed}`,
    `Remaining checklist items: ${report.remaining}`,
    '',
  ];

  if (!report.remainingItems.length) {
    lines.push('No remaining launch review checklist items.');
  } else {
    lines.push('Remaining items:');
    for (const item of report.remainingItems) {
      lines.push(`- [${item.section}] ${item.text}`);
    }
    lines.push('');
    lines.push('Do not mark the goal complete until these items are resolved and verified.');
  }

  console.log(lines.join('\n'));
}
