#!/usr/bin/env node
/**
 * Collect all progress metrics and write to metrics.json
 * Run via: npm run collect
 * Requires: GITHUB_TOKEN, MWMBL_API_KEY, MWMBL_API_URL env vars
 */

import { Octokit } from "octokit";
import fs from "fs";
import path from "path";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MWMBL_API_KEY = process.env.MWMBL_API_KEY;
const MWMBL_API_URL = process.env.MWMBL_API_URL || "https://api.mwmbl.org";

if (!GITHUB_TOKEN) {
  console.error("ERROR: GITHUB_TOKEN not set");
  process.exit(1);
}
// MWMBL_API_KEY is optional - crawler stats endpoint is public

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Repos to track commits for
const REPOS = [
  { owner: "mwmbl", repo: "mwmbl", label: "mwmbl (backend)" },
  { owner: "mwmbl", repo: "mwmbl_rank", label: "mwmbl_rank (Rust)" },
  { owner: "mwmbl", repo: "front-end", label: "front-end (SvelteKit)" },
  { owner: "mwmbl", repo: "book", label: "book (documentation)" },
];

// Blog repo for post count
const BLOG_REPO = { owner: "mwmbl", repo: "blog", path: "content" };

// Load manual/configurable metrics from manual-metrics.json (committed to main branch)
const manualMetrics = JSON.parse(fs.readFileSync(path.join(process.cwd(), "manual-metrics.json"), "utf-8"));
const GOALS = manualMetrics.goals;

async function getCommitCount(owner, repo) {
  try {
    // Use the GitHub API to get commit count
    // We'll use the contributors endpoint with anon=1 to get total commits
    const response = await octokit.rest.repos.getCommitActivityStats({
      owner,
      repo,
    });
    // Sum all weeks
    return response.data.reduce((sum, week) => sum + week.total, 0);
  } catch (error) {
    console.warn(`Failed to get commit count for ${owner}/${repo}:`, error.message);
    // Fallback: try to get from contributors
    try {
      const contributors = await octokit.rest.repos.getContributorsStats({
        owner,
        repo,
      });
      return contributors.data.reduce((sum, c) => sum + c.total, 0);
    } catch (e) {
      console.warn(`Fallback also failed for ${owner}/${repo}:`, e.message);
      return 0;
    }
  }
}

async function getBlogPostCount() {
  try {
    const response = await octokit.rest.repos.getContent({
      owner: BLOG_REPO.owner,
      repo: BLOG_REPO.repo,
      path: BLOG_REPO.path,
    });
    const items = Array.isArray(response.data) ? response.data : [response.data];
    // Count markdown files (blog posts)
    return items.filter((item) => item.name.endsWith(".md") || item.name.endsWith(".markdown")).length;
  } catch (error) {
    console.warn("Failed to get blog post count:", error.message);
    return 0;
  }
}

async function getPagesCrawledPerDay() {
  try {
    // Public endpoint - no auth needed for crawler stats
    const response = await fetch(`${MWMBL_API_URL}/api/v1/crawler/stats`, {
      headers: { "Accept": "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    // Get the latest day's results_indexed_daily
    const results = data.results_indexed_daily || {};
    const dates = Object.keys(results).sort();
    const latestDate = dates[dates.length - 1];
    return results[latestDate] || 0;
  } catch (error) {
    console.warn("Failed to get pages crawled:", error.message);
    return 0;
  }
}

async function getNDCGScore() {
  try {
    // Read from the rankeval data in the mwmbl repo
    // The latest evaluation results are in devdata/rankeval/
    const response = await octokit.rest.repos.getContent({
      owner: "mwmbl",
      repo: "mwmbl",
      path: "devdata/rankeval/learning-to-rank.csv",
    });
    // This is a CSV file, we'd need to parse it
    // For now, return a placeholder - we can improve this
    console.warn("NDCG score collection not fully implemented - using placeholder");
    return 10; // placeholder percentage
  } catch (error) {
    console.warn("Failed to get NDCG score:", error.message);
    return 0;
  }
}

function calculatePoints(metrics) {
  const points = {};
  let totalPoints = 0;
  let totalMaxPoints = 0;

  // Technology
  points.commits = Math.min(metrics.commits, GOALS.technology.commits.maxPoints);
  points.pagesCrawledPerDay = Math.min(
    Math.floor(metrics.pagesCrawledPerDay / 1_000_000) * GOALS.technology.pagesCrawledPerDay.pointsPerMillion,
    GOALS.technology.pagesCrawledPerDay.maxPoints
  );
  points.ndcg = Math.min(metrics.ndcg * GOALS.technology.ndcg.pointsPerPercent, GOALS.technology.ndcg.maxPoints);

  // Community
  points.blogPosts = Math.min(metrics.blogPosts * GOALS.community.blogPosts.pointsPer, GOALS.community.blogPosts.maxPoints);
  points.videos = Math.min(metrics.videos * GOALS.community.videos.pointsPer, GOALS.community.videos.maxPoints);
  points.volunteers = Math.min(metrics.volunteers * GOALS.community.volunteers.pointsPer, GOALS.community.volunteers.maxPoints);

  // Organisation
  points.employees = Math.min(metrics.employees * GOALS.organisation.employees.pointsPer, GOALS.organisation.employees.maxPoints);
  points.incorporation = metrics.incorporationPoints || 0;
  points.affiliatedOrgs = Math.min(metrics.affiliatedOrgs * GOALS.organisation.affiliatedOrgs.pointsPer, GOALS.organisation.affiliatedOrgs.maxPoints);
  points.bookCommits = Math.min(metrics.bookCommits * GOALS.organisation.bookCommits.pointsPer, GOALS.organisation.bookCommits.maxPoints);

  // Totals
  totalPoints = Object.values(points).reduce((sum, p) => sum + p, 0);
  totalMaxPoints = Object.values(GOALS).flatMap(cat => Object.values(cat)).reduce((sum, g) => sum + (g.maxPoints || 0), 0);

  return { points, totalPoints, totalMaxPoints, percentage: (totalPoints / totalMaxPoints * 100).toFixed(4) };
}

async function main() {
  console.log("Collecting progress metrics...");

  // Collect all metrics in parallel where possible
  const [commitResults, blogPosts, pagesCrawled, ndcg] = await Promise.all([
    Promise.all(REPOS.map(r => getCommitCount(r.owner, r.repo))),
    getBlogPostCount(),
    getPagesCrawledPerDay(),
    getNDCGScore(),
  ]);

  const commits = commitResults.reduce((sum, c) => sum + c, 0);
  const bookCommits = commitResults[3] || 0; // book repo is 4th

  // Calculate incorporation points from manual config
  const incorporationPoints = [
    manualMetrics.organisation.incorporation.ukNonprofit ? 20000 : 0,
    manualMetrics.organisation.incorporation.ukCharity ? 20000 : 0,
    manualMetrics.organisation.incorporation.usNonprofit ? 20000 : 0,
  ].reduce((a, b) => a + b, 0);

  const metrics = {
    // Technology
    commits,
    pagesCrawledPerDay: pagesCrawled,
    ndcg,
    // Community
    blogPosts,
    videos: manualMetrics.community.videos.value,
    volunteers: manualMetrics.community.volunteers.value,
    // Organisation
    employees: manualMetrics.organisation.employees.value,
    incorporationPoints,
    affiliatedOrgs: manualMetrics.organisation.affiliatedOrgs.value,
    bookCommits,
    // Metadata
    collectedAt: new Date().toISOString(),
    repos: REPOS.map((r, i) => ({ label: r.label, commits: commitResults[i] })),
  };

  const { points, totalPoints, totalMaxPoints, percentage } = calculatePoints(metrics);

  const output = {
    metrics,
    points,
    totals: {
      current: totalPoints,
      max: totalMaxPoints,
      percentage: parseFloat(percentage),
    },
    goals: GOALS,
    collectedAt: metrics.collectedAt,
  };

  const outputPath = path.join(process.cwd(), "metrics.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Metrics written to ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});