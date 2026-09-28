/**
 * Mwmbl Progress Page - Client-side rendering
 * Fetches auto-collected metrics (data branch) + manual config (main branch)
 */

const DATA_BRANCH_URL = "https://raw.githubusercontent.com/mwmbl/progress/data/main/metrics.json";
const MAIN_BRANCH_URL = "https://raw.githubusercontent.com/mwmbl/progress/main/manual-metrics.json";

async function fetchJSON(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

function formatNumber(n) {
  return n.toLocaleString();
}

function renderProgressBar(element, percentage) {
  element.style.width = `${Math.min(100, percentage)}%`;
}

function renderCategoryTable(categoryName, metrics, goals, manualConfig) {
  const categoryGoals = goals[categoryName];
  const rows = [];

  // Define metric display order and labels for each category
  const metricDefs = {
    technology: [
      { key: "commits", label: "Git commits (all repos)", unit: "", pointsKey: "commits" },
      { key: "pagesCrawledPerDay", label: "Pages crawled per day", unit: "", pointsKey: "pagesCrawled" },
      { key: "ndcg", label: "NDCG score", unit: "%", pointsKey: "ndcg" },
    ],
    community: [
      { key: "blogPosts", label: "Blog posts", unit: "", pointsKey: "blogPosts" },
      { key: "videos", label: "YouTube videos", unit: "", pointsKey: "videos" },
      { key: "volunteers", label: "Active volunteers", unit: "", pointsKey: "volunteers" },
    ],
    organisation: [
      { key: "employees", label: "Employees", unit: "", pointsKey: "employees" },
      { key: "incorporationPoints", label: "Incorporation milestones", unit: " pts", pointsKey: "incorporation" },
      { key: "affiliatedOrgs", label: "Affiliated organisations", unit: "", pointsKey: "affiliatedOrgs" },
      { key: "bookCommits", label: "Book commits", unit: "", pointsKey: "bookCommits" },
    ],
  };

  const defs = metricDefs[categoryName] || [];

  for (const def of defs) {
    const value = metrics[def.key];
    const goal = categoryGoals[def.pointsKey]?.goal || "—";
    const points = metrics.points?.[def.pointsKey] || 0;
    const maxPoints = categoryGoals[def.pointsKey]?.maxPoints || "—";

    let displayValue = value;
    if (def.key === "pagesCrawledPerDay") {
      displayValue = `${formatNumber(Math.round(value / 1_000_000))}M`;
    } else if (def.key === "ndcg") {
      displayValue = `${value}%`;
    } else if (def.key === "incorporationPoints") {
      displayValue = `${formatNumber(value)} pts`;
    } else {
      displayValue = formatNumber(value);
    }

    let goalDisplay = goal;
    if (def.key === "pagesCrawledPerDay") {
      goalDisplay = `${formatNumber(Math.round(goal / 1_000_000))}M`;
    }

    const isManual = (categoryName === "community" && ["videos", "volunteers"].includes(def.key)) ||
                     (categoryName === "organisation" && ["employees", "incorporationPoints", "affiliatedOrgs"].includes(def.key));

    rows.push(`
      <tr${isManual ? ' class="hardcoded"' : ''}>
        <td class="metric-name">${def.label}</td>
        <td class="metric-value">${displayValue}</td>
        <td class="metric-goal">Goal: ${goalDisplay}</td>
        <td class="metric-points">${formatNumber(points)} / ${formatNumber(maxPoints)}</td>
      </tr>
    `);
  }

  // Category total row
  const catPoints = Object.values(metrics.points || {})
    .filter((_, i) => defs.some(d => d.pointsKey === Object.keys(metrics.points || {})[i]))
    .reduce((a, b) => a + b, 0);
  const catMaxPoints = defs.reduce((sum, d) => sum + (categoryGoals[d.pointsKey]?.maxPoints || 0), 0);

  rows.push(`
    <tr class="category-total">
      <td>Category Total</td>
      <td></td>
      <td></td>
      <td class="metric-points">${formatNumber(catPoints)} / ${formatNumber(catMaxPoints)}</td>
    </tr>
  `);

  return `
    <div class="category">
      <div class="category-header">${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)}</div>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Current</th>
            <th>Goal</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function main() {
  const categoriesEl = document.getElementById("categories");
  const lastUpdatedEl = document.getElementById("lastUpdated");
  const totalPercentageEl = document.getElementById("totalPercentage");
  const totalCurrentEl = document.getElementById("totalCurrent");
  const totalMaxEl = document.getElementById("totalMax");
  const totalProgressBarEl = document.getElementById("totalProgressBar");

  try {
    // Fetch both data sources in parallel
    const [autoData, manualData] = await Promise.all([
      fetchJSON(DATA_BRANCH_URL),
      fetchJSON(MAIN_BRANCH_URL),
    ]);

    // Merge: autoData has metrics + points + totals, manualData has goals + manual values
    const metrics = autoData.metrics;
    const points = autoData.points;
    const totals = autoData.totals;
    const goals = manualData.goals;

    // Update last updated timestamp
    const collectedAt = new Date(autoData.collectedAt);
    lastUpdatedEl.textContent = `Last updated: ${collectedAt.toLocaleDateString()} ${collectedAt.toLocaleTimeString()} UTC`;

    // Update grand total
    totalPercentageEl.textContent = `${totals.percentage}%`;
    totalCurrentEl.textContent = formatNumber(totals.current);
    totalMaxEl.textContent = formatNumber(totals.max);
    renderProgressBar(totalProgressBarEl, totals.percentage);

    // Render each category
    const categoryHtml = ["technology", "community", "organisation"]
      .map(cat => renderCategoryTable(cat, { ...metrics, points }, goals, manualData))
      .join("");

    categoriesEl.innerHTML = categoryHtml;

  } catch (error) {
    console.error(error);
    categoriesEl.innerHTML = `<div class="error">Failed to load metrics: ${error.message}</div>`;
    lastUpdatedEl.textContent = "Error loading data";
  }
}

main();