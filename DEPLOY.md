# Deploying Dag: GitHub, then Render, then Vercel

The order matters. Render runs the API and gives you its URL. You write that
URL into `js/config.js`, push, and only then import the repo on Vercel, so the
Vercel page knows where the API is.

```
judge's browser ──> Vercel (static page) ──fetch──> Render (node server/http.js) /api/...
                         │                                │
                         └── if Render sleeps > 80 s ─────┘──> same backend runs in the browser
```

The Render URL on its own is also a complete demo (it serves the page too).
Vercel is the fast, always-awake front door.

Everything below is for Linux (Ubuntu, Fedora, Arch, WSL). Replace
`YOUR-GITHUB-USERNAME` with yours.

---

## 0. Unzip

```bash
cd ~/Downloads
unzip -o Dag_SiliconKnights_LandTech2026.zip -d ~/Projects
cd ~/Projects/dag
ls            # css  docs  fonts  index.html  js  render.yaml  server  tests  vercel.json ...
git log --oneline | head -5     # the history comes with the zip
```

No `unzip`? `sudo apt install unzip` (Ubuntu/Debian) or `sudo dnf install unzip` (Fedora).

## 1. Check it on your machine (2 minutes, optional but worth it)

Needs Node 18 or newer (`node -v`). There are no packages to install.

```bash
npm test                      # 34 tests, about 6 seconds
node server/http.js           # open http://localhost:8787
```

Press Ctrl+C to stop the server. To see the static version (backend in the browser):

```bash
python3 -m http.server 5173   # open http://localhost:5173
```

## 2. Push to GitHub

Create an empty repository on github.com named `dag-landtech` (no README,
no .gitignore, no licence: the project has its own). Then:

```bash
cd ~/Projects/dag
git remote remove origin 2>/dev/null
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/dag-landtech.git
git branch -M main
git push -u origin main
```

When git asks for a password, paste a **personal access token**, not your
GitHub password (github.com > Settings > Developer settings > Personal access
tokens > Tokens (classic) > Generate, tick `repo`).

With the GitHub CLI instead (`sudo apt install gh`, then `gh auth login`):

```bash
gh repo create dag-landtech --public --source=. --remote=origin --push
```

**Already pushed v1.1 to a repo?** This zip carries the same history plus the
new commits, so a normal push to that repo works:

```bash
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/dag-landtech.git 2>/dev/null
git push -u origin main
```

If git refuses because the GitHub copy has commits you made on the website,
run `git pull --rebase origin main` and push again. Do not force-push: the
rules ask that commit history is not rewritten.

The **tests** workflow (`.github/workflows/ci.yml`) runs `npm test` on Node
18, 20 and 22 for every push. A green tick next to the commit on GitHub means
all 34 pass.

## 3. Render: the API (first)

1. Go to https://dashboard.render.com and sign in with GitHub.
2. **New > Blueprint**. Pick the `dag-landtech` repository. Render reads
   `render.yaml` and shows one web service, `dag-landtech-api`. Press **Apply**.
3. Wait for the first deploy (2 to 4 minutes). The log ends with
   `Dag is running at http://localhost:10000`.
4. Copy the service URL from the top of the page, for example
   `https://dag-landtech-api.onrender.com`.
5. Open `https://dag-landtech-api.onrender.com/api/health` in the browser.
   You should see `{"ok":true,"version":5,"keys":"server",...}`.

`render.yaml` sets everything: Node 20, free plan, Singapore region (closest
to Dhaka), health check on `/api/health`, and two secret signing seeds
(`DAG_GATE_SEED`, `DAG_ORACLE_SEED`) that Render generates once and keeps.

**Already have the service from v1.1?** It redeploys by itself when you push.
Open the service > **Environment** and check that `DAG_GATE_SEED` and
`DAG_ORACLE_SEED` exist. If not, add both by hand, each with a long random
value:

```bash
openssl rand -hex 32     # run twice, one value for each
```

**Without the Blueprint** (New > Web Service by hand): Runtime `Node`, Build
command `npm install --no-audit --no-fund`, Start command `node server/http.js`,
Health check path `/api/health`, Instance type `Free`, and the environment
variables `NODE_VERSION=20`, `DAG_DATA_DIR=/tmp/dag-data`, `DAG_GATE_SEED`,
`DAG_ORACLE_SEED`.

## 4. Point the front end at Render

One line in `js/config.js`. Use your own Render URL:

```bash
cd ~/Projects/dag
sed -i "s#api: 'auto'#api: 'https://dag-landtech-api.onrender.com'#" js/config.js
grep "api:" js/config.js        # should print the Render URL
git commit -am "Point the front end at the Render API"
git push
```

This does not change the page Render itself serves: that page always talks
to its own server.

## 5. Vercel: the front end (second)

1. Go to https://vercel.com/new and sign in with GitHub.
2. Import `dag-landtech`.
3. Framework Preset: **Other**. Root Directory: `./`.
   Build and Output Settings: turn on the override for **Build Command** and
   leave it empty; turn on the override for **Output Directory** and type `.`
   (a single dot). Install Command: override, leave empty.
4. **Deploy**. You get a URL such as `https://dag-landtech.vercel.app`.

`vercel.json` adds the security headers (a Content Security Policy that only
lets the page talk to itself and to `*.onrender.com`), keeps `js/config.js`
uncached so a URL change shows up at once, and caches the fonts for a year.
`.vercelignore` keeps the server and tests out of the static site.

With the Vercel CLI instead:

```bash
npm i -g vercel
vercel            # first time: answers are Y, your account, N (new project), dag-landtech, ./
vercel --prod
```

## 6. Check both, from your terminal

```bash
node scripts/smoke.mjs https://dag-landtech-api.onrender.com https://dag-landtech.vercel.app
```

It wakes Render if needed (up to 90 s), logs in, runs scenario 1 and 4,
verifies the signature and the QR token, checks that the owner gets the SMS
and cannot reach the counter, checks the audit chain, and checks that the
Vercel `js/config.js` points at the Render URL. Every line should say `ok`.

Then open the Vercel URL. The top bar shows **Server dag-landtech-api.onrender.com**
in green. If Render was asleep, the phone shows a wake screen with a seconds
counter first; **Use the backend in this browser now** skips the wait.

## 7. Links to put in the submission

| What | Link |
|---|---|
| Live demo | `https://dag-landtech.vercel.app` |
| Same demo, served by the API | `https://dag-landtech-api.onrender.com` |
| Autoplay in Bangla | `https://dag-landtech.vercel.app/?lang=bn&autoplay=1` |
| Autoplay in English | `https://dag-landtech.vercel.app/?lang=en&autoplay=1` |
| Code | `https://github.com/YOUR-GITHUB-USERNAME/dag-landtech` |

Open the Render URL once about two minutes before judging starts so the free
service is awake.

## Updating later

```bash
cd ~/Projects/dag
# edit files
npm test
git add -A
git commit -m "Say what changed"
git push          # Render and Vercel both redeploy by themselves
```

## When something goes wrong

| You see | Do this |
|---|---|
| Top bar says **Server asleep, using this browser** | Render did not answer within 80 s. Open the `/api/health` URL, wait for it, reload the Vercel page. The demo works either way. |
| Browser console: `Refused to connect ... violates Content Security Policy` | The API is not on `*.onrender.com`. Add its origin to `connect-src` in `vercel.json` and push. |
| `smoke.mjs` says config does not point at the API | Step 4 was skipped or not pushed. `grep "api:" js/config.js`, fix, push. |
| Render log: `Error: listen EADDRINUSE` | Only locally: another server is on 8787. `PORT=8790 node server/http.js`. |
| `git push` asks for a password and fails | Use a personal access token (step 2), or `gh auth login`. |
| Judges want a clean start | **Reset demo** in the top bar resets only that browser's workspace. |

Other hosts work too: `Dockerfile` for Railway, Fly.io or any container host;
the static files alone for GitHub Pages or Netlify (they run the backend in
the browser).
