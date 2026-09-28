# Mwmbl Progress Page

Automated progress tracking for the Mwmbl search engine, displayed at **progress.mwmbl.org** (GitHub Pages).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions (daily at 02:00 UTC)                        │
│  1. Runs collect-metrics.js                                 │
│  2. Fetches: GitHub API (commits, blog posts)               │
│     + mwmbl API (pages crawled)                             │
│  3. Merges with manual-metrics.json (from main branch)      │
│  4. Writes metrics.json → pushes to `data` branch           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Pages (gh-pages branch)                             │
│  - index.html + app.js (static, never changes)              │
│  - On load: fetches metrics.json from `data` branch         │
│  - Renders progress table client-side                       │
└─────────────────────────────────────────────────────────────┘
```

**Branches:**
- `main` — site code + `manual-metrics.json` (config, rarely changes)
- `data` — `metrics.json` (auto-updated daily, force-pushed)
- `gh-pages` — built site (deployed via GitHub Pages)

## Metrics Tracked

### Technology (auto-collected)
- **Git commits** — across mwmbl, mwmbl_rank, front-end, book repos
- **Pages crawled/day** — from mwmbl internal API
- **NDCG score** — from rankeval data (placeholder, needs implementation)

### Community (mixed)
- **Blog posts** — auto from mwmbl/blog repo content/ folder
- **YouTube videos** — manual (in manual-metrics.json)
- **Volunteers** — manual (Firefox extension stats)

### Organisation (manual)
- **Employees** — manual
- **Incorporation milestones** — manual (UK nonprofit, UK charity, US nonprofit)
- **Affiliated organisations** — manual
- **Book commits** — auto from book repo

## Local Development

```bash
# Install dependencies
npm install

# Run collector (requires env vars)
GITHUB_TOKEN=xxx MWMBL_API_KEY=xxx npm run collect

# View metrics.json
cat metrics.json

# Serve locally (any static server)
npx serve .
# or
python3 -m http.server 8000
```

### Local Testing (No GitHub Required)

The page auto-detects local mode when running on `localhost`, `127.0.0.1`, or `file://` protocol. It will fetch `metrics.json` and `manual-metrics.json` from the local filesystem instead of GitHub.

**To test locally:**
1. Run a local server: `python3 -m http.server 8000`
2. Open `http://localhost:8000` — it will use local `metrics.json` automatically

**To force production mode locally:**
- Add `?local=0` to URL: `http://localhost:8000?local=0`

**To force local mode on production:**
- Add `?local=1` to URL, or
- Run in console: `progressDebug.toggleLocal()`

**Console debugging:**
```js
progressDebug.isLocal()        // true/false
progressDebug.getUrls()        // { data, manual, mode }
progressDebug.toggleLocal()    // Switch mode & reload
```

A sample `metrics.json` is included in the repo with example data matching the book.mwmbl.org progress page (June 2025 snapshot).

## Deployment Setup

### 1. Create GitHub Repository
```bash
gh repo create blueheron786/progress --public --source=. --push
```

### 2. Enable GitHub Pages
- Settings → Pages → Source: "Deploy from a branch"
- Branch: `gh-pages` / `/ (root)`

### 3. Configure Secrets (Settings → Secrets → Actions)
| Secret | Description |
|--------|-------------|
| `GITHUB_TOKEN` | Auto-provided by GitHub (no action needed) |
| `MWMBL_API_KEY` | API key for mwmbl internal API (crawler stats) |
| `MWMBL_API_URL` | Optional: mwmbl API base URL (default: https://api.mwmbl.org) |

### 4. Deploy Initial Site
The `gh-pages` branch needs the static files. Either:
- Push `index.html` + `app.js` to `gh-pages` branch manually, or
- Add a deploy workflow (see below)

### 5. Manual Metrics Config
Edit `manual-metrics.json` on `main` branch for:
- YouTube video count
- Volunteer count
- Employee count
- Incorporation status
- Affiliated organisations

## Adding a Deploy Workflow (Optional)

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - uses: actions/deploy-pages@v4
```

## Updating Manual Metrics

1. Edit `manual-metrics.json` on `main` branch
2. Commit & push
3. Next daily run (or manual trigger) will pick up new values

## API Endpoints Used

- `GET /repos/{owner}/{repo}/stats/commit_activity` — commit counts
- `GET /repos/{owner}/{repo}/contents/{path}` — blog post count
- `GET /api/v1/crawler/stats/` — mwmbl internal (requires API key)

## Customization

- **Goals/points**: Edit `manual-metrics.json` → `goals` section
- **Repos tracked**: Edit `REPOS` array in `collect-metrics.js`
- **Schedule**: Edit cron in `.github/workflows/collect-metrics.yml`