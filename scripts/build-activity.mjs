// Builds activity.json from the GitHub GraphQL API.
// Needs env ACTIVITY_TOKEN with read access to contributions (incl. private repos).
// Run by .github/workflows/activity.yml on a daily schedule.
import { writeFileSync } from "node:fs";

const LOGIN = process.env.ACTIVITY_LOGIN || "Jerrybery";
const TOKEN = process.env.ACTIVITY_TOKEN;
const WINDOW_DAYS = 30;
const MAX_PUBLIC_REPOS = 5;

if (!TOKEN) {
  console.error("ACTIVITY_TOKEN is not set");
  process.exit(1);
}

const now = new Date();
const from = new Date(now.getTime() - WINDOW_DAYS * 86400000).toISOString();
const to = now.toISOString();

const query = `
query($login:String!, $from:DateTime!, $to:DateTime!) {
  user(login: $login) {
    last30: contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      contributionCalendar { weeks { contributionDays { contributionCount date } } }
      commitContributionsByRepository(maxRepositories: 25) {
        repository { name url isPrivate }
        contributions { totalCount }
      }
    }
    year: contributionsCollection {
      contributionCalendar { weeks { contributionDays { contributionCount date } } }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "jerrybery-activity",
  },
  body: JSON.stringify({ query, variables: { login: LOGIN, from, to } }),
});

const json = await res.json();
if (json.errors) {
  console.error("GraphQL errors:", JSON.stringify(json.errors, null, 2));
  process.exit(1);
}

const user = json.data.user;
const days30 = user.last30.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
const commits = user.last30.totalCommitContributions;
const active_days = days30.filter((d) => d.contributionCount > 0).length;

// streak: trailing run of active days in the full-year calendar
const yearDays = user.year.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .sort((a, b) => (a.date < b.date ? -1 : 1));
let streak_days = 0;
for (let i = yearDays.length - 1; i >= 0; i--) {
  if (yearDays[i].contributionCount > 0) streak_days++;
  else break;
}

// sparkline: weekly sums for the last 26 weeks
const spark = user.year.contributionCalendar.weeks
  .slice(-26)
  .map((w) => w.contributionDays.reduce((a, d) => a + d.contributionCount, 0));

// repos: public named (top N), private aggregated and never named
const byRepo = user.last30.commitContributionsByRepository
  .map((r) => ({
    name: r.repository.name,
    url: r.repository.url,
    count: r.contributions.totalCount,
    private: r.repository.isPrivate,
  }))
  .filter((r) => r.count > 0);

const repos = byRepo
  .filter((r) => !r.private)
  .sort((a, b) => b.count - a.count)
  .slice(0, MAX_PUBLIC_REPOS);

const priv = byRepo.filter((r) => r.private);
if (priv.length) {
  repos.push({
    name: "Private repos",
    url: null,
    count: priv.reduce((a, r) => a + r.count, 0),
    private: true,
    repo_count: priv.length,
  });
}

const out = {
  generated_at: now.toISOString().slice(0, 10),
  window_days: WINDOW_DAYS,
  commits,
  active_days,
  streak_days,
  spark,
  repos,
};

writeFileSync("activity.json", JSON.stringify(out, null, 2) + "\n");
console.log("wrote activity.json:", JSON.stringify(out));
