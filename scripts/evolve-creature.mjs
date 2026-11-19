import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GITHUB_USERNAME || process.env.GITHUB_ACTOR;
const TOKEN = process.env.GITHUB_TOKEN;
const WINDOW_MODE = process.env.CREATURE_WINDOW || "annual";
const VIEW_MODE = process.env.CREATURE_VIEW || "side";
const SVG_PATH = path.resolve("creature.svg");
const README_PATH = path.resolve("README.md");

const CREATURE_NAME = "CYBER-TULKUN";
const CREATURE_DISPLAY = "Cyber-Tulkun";
const CUSTOM_TITLE = "";
const ENERGY_COLOR = "#00E676";

const STAGES = [
  { stage: 1, rank: "PROTOTYPE", min: 0 },
  { stage: 2, rank: "RECON", min: 150 },
  { stage: 3, rank: "ARMORED", min: 500 },
  { stage: 4, rank: "APEX", min: 1200 },
  { stage: 5, rank: "ASCENDED", min: 2500 },
];

function getEvolutionStage(commits) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (commits >= STAGES[i].min) return STAGES[i];
  }
  return STAGES[0];
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchProfileTelemetry(username, token, windowMode) {
  if (!username || !token) {
    throw new Error("Missing GITHUB_USERNAME or GITHUB_TOKEN");
  }

  const now = new Date();
  const fromDate =
    windowMode === "annual"
      ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString()
      : new Date(now.getTime() - 365 * 86400 * 1000).toISOString();

  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
          }
        }
        repositories(first: 30, ownerAffiliations: OWNER, isFork: false, orderBy: { field: UPDATED_AT, direction: DESC }) {
          nodes {
            primaryLanguage {
              name
              color
            }
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "dynamic-readme-creature",
    },
    body: JSON.stringify({
      query,
      variables: { login: username, from: fromDate, to: now.toISOString() },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL error: ${response.status}`);
  }

  const payload = await response.json();
  const user = payload?.data?.user;
  const total = user?.contributionsCollection?.contributionCalendar?.totalContributions;

  if (typeof total !== "number") {
    throw new Error("Unable to read totalContributions from GitHub API");
  }

  const langCounts = new Map();
  for (const repo of user?.repositories?.nodes || []) {
    const lang = repo?.primaryLanguage;
    if (!lang?.name) continue;
    const prev = langCounts.get(lang.name) || { name: lang.name, color: lang.color || "#8B949E", count: 0 };
    prev.count += 1;
    langCounts.set(lang.name, prev);
  }

  const topLanguages = Array.from(langCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { commits: total, topLanguages };
}

function updateReadmeMarkers(username, stage, rank, commits, topLanguages) {
  if (!fs.existsSync(README_PATH)) return;
  const startMarker = "<!-- CYBER-CREATURE:START -->";
  const endMarker = "<!-- CYBER-CREATURE:END -->";
  const raw = fs.readFileSync(README_PATH, "utf8");
  const startIdx = raw.indexOf(startMarker);
  const endIdx = raw.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return;
  }

  const formattedCommits = commits.toLocaleString("en-US");
  const langsSummary =
    topLanguages.length > 0
      ? ` · Top Stack: ${topLanguages.map((l) => `<code>${l.name}</code>`).join(" ")}`
      : "";
  const updatedDate = new Date().toISOString().slice(0, 10);

  const replacement = [
    startMarker,
    `<p align="center">`,
    `  <a href="https://github.com/PathumSandeepa/dynamic-readme-creature">`,
    `    <img src="./creature.svg" width="760" alt="${CREATURE_DISPLAY} - Stage ${stage} ${rank}" />`,
    `  </a>`,
    `</p>`,
    ``,
    `<p align="center"><sub>Live <code>dynamic-readme-creature</code> for <strong>@${username}</strong> — <strong>Stage ${stage}: ${rank} ${CREATURE_DISPLAY}</strong> · <code>${formattedCommits} commits</code> · View: <code>${VIEW_MODE}</code>${langsSummary} · Synced ${updatedDate}</sub></p>`,
    endMarker,
  ].join("\n");

  const updated =
    raw.slice(0, startIdx) + replacement + raw.slice(endIdx + endMarker.length);
  fs.writeFileSync(README_PATH, updated, "utf8");
}

async function main() {
  if (!fs.existsSync(SVG_PATH)) {
    throw new Error("creature.svg not found in repository root.");
  }

  const { commits, topLanguages } = await fetchProfileTelemetry(
    USERNAME,
    TOKEN,
    WINDOW_MODE
  );
  const { stage, rank } = getEvolutionStage(commits);
  const title = CUSTOM_TITLE
    ? CUSTOM_TITLE.toUpperCase()
    : `${rank} ${CREATURE_NAME}`;
  const hudLabel = `STAGE ${stage}: ${title} // COMMITS: ${commits.toLocaleString("en-US")}`;

  let svg = fs.readFileSync(SVG_PATH, "utf8");

  svg = svg.replace(
    /(<text id="cc-hud-label"[^>]*>)([\s\S]*?)(<\/text>)/,
    `$1${escapeXml(hudLabel)}$3`
  );

  for (let i = 1; i <= 5; i++) {
    const fill = i === stage ? ENERGY_COLOR : i < stage ? "#C9D1D9" : "#484F58";
    const weight = i === stage ? "700" : "500";
    const railRegex = new RegExp(
      `(<text id="cc-stage-pip-${i}"[^>]*fill=")[^"]*("[^>]*font-weight=")[^"]*(")`
    );
    svg = svg.replace(railRegex, `$1${fill}$2${weight}$3`);
  }

  fs.writeFileSync(SVG_PATH, svg, "utf8");
  updateReadmeMarkers(USERNAME, stage, rank, commits, topLanguages);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
