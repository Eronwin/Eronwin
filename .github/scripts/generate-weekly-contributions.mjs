const username = process.env.GITHUB_USERNAME || "eronwin";
const weekCount = Number(process.env.WEEK_COUNT || 12);
const streakLookbackWeeks = Number(process.env.STREAK_LOOKBACK_WEEKS || 16);
const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("GITHUB_TOKEN is required");
}

const now = new Date();
const from = new Date(now);
from.setUTCDate(from.getUTCDate() - streakLookbackWeeks * 7);

const query = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          firstDay
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "eronwin-profile-weekly-contributions",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: username,
      from: from.toISOString(),
      to: now.toISOString(),
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const allWeeks = payload.data.user.contributionsCollection.contributionCalendar.weeks
  .map((week) => ({
    firstDay: week.firstDay,
    count: week.contributionDays.reduce((sum, day) => sum + day.contributionCount, 0),
  }));

const weeks = allWeeks.slice(-weekCount);

const getCurrentWeeklyStreak = (items) => {
  let streak = 0;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].count === 0) {
      break;
    }
    streak += 1;
  }

  return streak;
};

const currentWeeklyStreak = getCurrentWeeklyStreak(allWeeks);

const total = weeks.reduce((sum, week) => sum + week.count, 0);
const max = Math.max(...weeks.map((week) => week.count), 1);
const chart = {
  x: 48,
  y: 82,
  width: 724,
  height: 110,
};
const slot = chart.width / weeks.length;
const barWidth = Math.min(34, slot * 0.52);

const escapeXml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  })[char]);

const formatDate = (value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
};

const getIsoWeek = (value) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
};

const bars = weeks.map((week, index) => {
  const height = Math.max(week.count ? 8 : 2, (week.count / max) * chart.height);
  const x = chart.x + slot * index + (slot - barWidth) / 2;
  const y = chart.y + chart.height - height;
  const intensity = week.count / max;
  const fill = intensity > 0.72 ? "#7aa2f7" : intensity > 0.44 ? "#2ac3de" : intensity > 0.18 ? "#9ece6a" : "#414868";
  const label = `W${String(getIsoWeek(week.firstDay)).padStart(2, "0")}`;

  return `
    <g>
      <title>${escapeXml(`${label} (${formatDate(week.firstDay)}): ${week.count} contributions`)}</title>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="6" fill="${fill}" />
      <text x="${(x + barWidth / 2).toFixed(1)}" y="218" text-anchor="middle" class="axis">${label}</text>
    </g>`;
}).join("");

const firstLabel = formatDate(weeks[0]?.firstDay || now.toISOString().slice(0, 10));
const lastLabel = formatDate(now.toISOString().slice(0, 10));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="260" viewBox="0 0 820 260" role="img" aria-labelledby="title desc">
  <title id="title">Recent ${weekCount} Weeks Contributions</title>
  <desc id="desc">${total} GitHub contributions from ${firstLabel} to ${lastLabel}, grouped by week. Current weekly streak is ${currentWeeklyStreak} weeks.</desc>
  <style>
    .title { fill: #c0caf5; font: 700 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .subtitle { fill: #7dcfff; font: 500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .axis { fill: #9aa5ce; font: 500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .grid { stroke: #292e42; stroke-width: 1; }
  </style>
  <rect width="820" height="260" rx="14" fill="#1a1b27" />
  <text x="32" y="40" class="title">Recent ${weekCount} Weeks</text>
  <text x="32" y="62" class="subtitle">${currentWeeklyStreak}-week current streak · last ${weekCount} shown · ${total} contributions · ${firstLabel} - ${lastLabel}</text>
  <line x1="${chart.x}" y1="${chart.y}" x2="${chart.x + chart.width}" y2="${chart.y}" class="grid" />
  <line x1="${chart.x}" y1="${chart.y + chart.height / 2}" x2="${chart.x + chart.width}" y2="${chart.y + chart.height / 2}" class="grid" />
  <line x1="${chart.x}" y1="${chart.y + chart.height}" x2="${chart.x + chart.width}" y2="${chart.y + chart.height}" class="grid" />
  ${bars}
</svg>
`;

await import("node:fs/promises").then((fs) => fs.writeFile("weekly-contributions.svg", svg));
