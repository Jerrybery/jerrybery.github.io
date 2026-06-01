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
      restrictedContributionsCount
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
// Private repos are never named by GitHub; they come back only as an anonymous count.
const restricted = user.last30.restrictedContributionsCount || 0;
const commits = user.last30.totalCommitContributions + restricted;
const active_days = days30.filter((d) => d.contributionCount > 0).length;

// streak: longest run of consecutive active days in the full-year calendar
const yearDays = user.year.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .sort((a, b) => (a.date < b.date ? -1 : 1));
let streak_days = 0;
let run = 0;
for (const d of yearDays) {
  if (d.contributionCount > 0) {
    run++;
    if (run > streak_days) streak_days = run;
  } else {
    run = 0;
  }
}

// sparkline: weekly sums for the last 26 weeks
const spark = user.year.contributionCalendar.weeks
  .slice(-26)
  .map((w) => w.contributionDays.reduce((a, d) => a + d.contributionCount, 0));

// repos: public ones are named (top N); private contributions are a single
// anonymous aggregate (restrictedContributionsCount) — GitHub never reveals names.
const repos = user.last30.commitContributionsByRepository
  .map((r) => ({
    name: r.repository.name,
    url: r.repository.url,
    count: r.contributions.totalCount,
    private: r.repository.isPrivate,
  }))
  .filter((r) => r.count > 0 && !r.private)
  .sort((a, b) => b.count - a.count)
  .slice(0, MAX_PUBLIC_REPOS);

if (restricted > 0) {
  repos.push({ name: "Private repos", url: null, count: restricted, private: true });
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
