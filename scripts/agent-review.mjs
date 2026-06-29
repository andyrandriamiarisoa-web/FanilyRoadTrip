#!/usr/bin/env node
/**
 * Agent de revue CI — valide le **dernier état d'une PR** face aux specs du
 * dépôt et à la couverture de tests, puis poste un compte-rendu en commentaire.
 *
 * Conçu pour être **consultatif** (jamais bloquant) : toute erreur ou absence
 * de configuration → sortie 0 avec un message honnête. La porte *bloquante*
 * est la couverture déterministe (seuils Vitest), gérée séparément en CI.
 *
 * Entrées (variables d'environnement) :
 *   ANTHROPIC_API_KEY   — sans elle : skip honnête (exit 0).
 *   GITHUB_TOKEN        — pour poster le commentaire (sinon : log seulement).
 *   GITHUB_REPOSITORY   — "owner/repo".
 *   PR_NUMBER           — numéro de PR.
 *   BASE_REF            — branche de base (défaut: main).
 *   ANTHROPIC_MODEL     — défaut: claude-sonnet-4-6.
 *
 * Aucune dépendance externe : fetch + child_process natifs (Node 22).
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const PR = process.env.PR_NUMBER;
const BASE = process.env.BASE_REF || "main";

const MARKER = "<!-- odyssee-agent-review -->";
const MAX_DIFF = 120_000; // octets — borne le coût/jetons
const MAX_SPEC = 40_000;

function log(msg) {
  console.log(`[agent-review] ${msg}`);
}

/** Skip honnête : on n'échoue jamais la CI sur l'étape consultative. */
function skip(reason) {
  log(`SKIP — ${reason}`);
  process.exit(0);
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function readCapped(path, cap) {
  if (!existsSync(path)) return "";
  const s = readFileSync(path, "utf8");
  return s.length > cap ? `${s.slice(0, cap)}\n…[tronqué]` : s;
}

function buildDiff() {
  // Diff cumulatif de la PR (base…head) — le « dernier état » de la PR.
  try {
    sh(`git fetch --no-tags --depth=100 origin ${BASE} 2>&1 || true`);
  } catch {
    /* best effort */
  }
  let diff = "";
  try {
    diff = sh(`git diff --no-color origin/${BASE}...HEAD`);
  } catch {
    try {
      diff = sh(`git diff --no-color ${BASE}...HEAD`);
    } catch {
      diff = "";
    }
  }
  if (diff.length > MAX_DIFF) {
    diff = `${diff.slice(0, MAX_DIFF)}\n…[diff tronqué à ${MAX_DIFF} octets]`;
  }
  return diff;
}

function coverageSummary() {
  const path = "coverage/coverage-summary.json";
  if (!existsSync(path)) return null;
  try {
    const json = JSON.parse(readFileSync(path, "utf8"));
    return json.total ?? null;
  } catch {
    return null;
  }
}

const REVIEW_TOOL = {
  name: "rapport_de_revue",
  description:
    "Émet un rapport de revue structuré : conformité aux specs et couverture de tests.",
  input_schema: {
    type: "object",
    properties: {
      specConformance: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["conforme", "ecarts", "incertain"] },
          findings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                severity: { type: "string", enum: ["bloquant", "majeur", "mineur"] },
                spec: { type: "string", description: "Règle/spec concernée (anti-pattern, convention…)." },
                detail: { type: "string" },
                file: { type: "string" },
              },
              required: ["severity", "detail"],
            },
          },
        },
        required: ["verdict", "findings"],
      },
      testCoverage: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["suffisante", "insuffisante", "incertain"] },
          missingCases: {
            type: "array",
            description: "Cas (validation ET échec) non couverts par des tests dans ce diff.",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["validation", "failure", "edge"] },
                detail: { type: "string" },
                file: { type: "string" },
              },
              required: ["kind", "detail"],
            },
          },
        },
        required: ["verdict", "missingCases"],
      },
      summary: { type: "string", description: "Synthèse en 2-3 phrases, en français." },
    },
    required: ["specConformance", "testCoverage", "summary"],
  },
};

const SYSTEM = `Tu es le relecteur qualité du projet Odyssée (PWA Next.js + TS strict, FR).
Tu valides un diff de PR contre les SPECS fournies (CLAUDE.md, AGENTS.md, DECISIONS.md)
et tu juges la COUVERTURE DE TESTS (cas de validation ET cas d'échec) des changements.

Règles d'or du projet (anti-patterns INTERDITS) :
1. Filtres excluants sur les hébergements (on classe, on n'élimine pas).
2. Conclure à l'absence sur un seul échec de recherche.
3. Afficher une donnée non vérifiée comme vérifiée (sourceStatus obligatoire).
4. Contraste < 4,5:1 (WCAG AA).
5. TODO/stub/lorem ipsum : chaque feature est complète ou absente.

Sois précis, concis, factuel. N'invente pas de fichiers. Concentre-toi sur le diff.
Si le diff ajoute de la logique sans tests de validation ET d'échec correspondants,
signale-le. Réponds UNIQUEMENT via l'outil rapport_de_revue.`;

async function callClaude({ diff, specs, coverage }) {
  const cov = coverage
    ? `Couverture globale actuelle : stmts ${coverage.statements.pct}% · branches ${coverage.branches.pct}% · funcs ${coverage.functions.pct}% · lines ${coverage.lines.pct}%.`
    : "Résumé de couverture indisponible.";

  const userContent = `## SPECS DU DÉPÔT\n${specs}\n\n## COUVERTURE\n${cov}\n\n## DIFF DE LA PR (base…head)\n\`\`\`diff\n${diff}\n\`\`\``;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      tools: [REVIEW_TOOL],
      tool_choice: { type: "tool", name: REVIEW_TOOL.name },
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = await res.json();
  const toolUse = (json.content ?? []).find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("Réponse sans tool_use");
  return toolUse.input;
}

function renderComment(report, coverage) {
  const sev = { bloquant: "🔴", majeur: "🟠", mineur: "🟡" };
  const verdictIcon = {
    conforme: "✅",
    ecarts: "⚠️",
    incertain: "❔",
    suffisante: "✅",
    insuffisante: "⚠️",
  };
  const sc = report.specConformance;
  const tc = report.testCoverage;
  const lines = [];
  lines.push(MARKER);
  lines.push("## 🤖 Revue agent — conformité specs & couverture");
  lines.push("");
  lines.push(`**Synthèse.** ${report.summary}`);
  lines.push("");
  lines.push(`### ${verdictIcon[sc.verdict] ?? "•"} Conformité aux specs : ${sc.verdict}`);
  if (sc.findings.length === 0) {
    lines.push("- Aucun écart relevé.");
  } else {
    for (const f of sc.findings) {
      lines.push(`- ${sev[f.severity] ?? "•"} **${f.severity}**${f.spec ? ` (${f.spec})` : ""}${f.file ? ` — \`${f.file}\`` : ""} : ${f.detail}`);
    }
  }
  lines.push("");
  lines.push(`### ${verdictIcon[tc.verdict] ?? "•"} Couverture de tests : ${tc.verdict}`);
  if (coverage) {
    lines.push(
      `> Mesurée : stmts ${coverage.statements.pct}% · branches ${coverage.branches.pct}% · funcs ${coverage.functions.pct}% · lines ${coverage.lines.pct}%`,
    );
  }
  if (tc.missingCases.length === 0) {
    lines.push("- Pas de cas manquant identifié.");
  } else {
    for (const m of tc.missingCases) {
      lines.push(`- **${m.kind}**${m.file ? ` — \`${m.file}\`` : ""} : ${m.detail}`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("_Revue **consultative** (ne bloque pas le merge). La porte bloquante est le seuil de couverture Vitest._");
  return lines.join("\n");
}

async function upsertComment(body) {
  if (!TOKEN || !REPO || !PR) {
    log("Pas de GITHUB_TOKEN/repo/PR — affichage du rapport dans les logs :");
    console.log(body);
    return;
  }
  const base = `https://api.github.com/repos/${REPO}`;
  const headers = {
    authorization: `Bearer ${TOKEN}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "odyssee-agent-review",
  };
  // Réutilise le commentaire existant (idempotent) pour ne pas spammer.
  const list = await fetch(`${base}/issues/${PR}/comments?per_page=100`, { headers });
  if (list.ok) {
    const comments = await list.json();
    const mine = comments.find((c) => typeof c.body === "string" && c.body.includes(MARKER));
    if (mine) {
      await fetch(`${base}/issues/comments/${mine.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ body }),
      });
      log(`Commentaire mis à jour (#${mine.id}).`);
      return;
    }
  }
  const created = await fetch(`${base}/issues/${PR}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body }),
  });
  if (!created.ok) {
    const t = await created.text().catch(() => "");
    log(`Échec de publication du commentaire (${created.status}): ${t.slice(0, 300)}`);
    return;
  }
  log("Commentaire publié.");
}

async function main() {
  if (!API_KEY) skip("ANTHROPIC_API_KEY absent — l'agent de revue est désactivé (ajoute le secret pour l'activer).");

  const diff = buildDiff();
  if (!diff.trim()) skip("Diff vide — rien à relire.");

  const specs = [
    "# CLAUDE.md\n" + readCapped("CLAUDE.md", MAX_SPEC),
    "# AGENTS.md\n" + readCapped("AGENTS.md", Math.floor(MAX_SPEC / 2)),
    "# DECISIONS.md\n" + readCapped("DECISIONS.md", Math.floor(MAX_SPEC / 2)),
  ].join("\n\n");

  const coverage = coverageSummary();

  let report;
  try {
    report = await callClaude({ diff, specs, coverage });
  } catch (e) {
    skip(`Appel Claude impossible (${e instanceof Error ? e.message : e}).`);
  }

  const body = renderComment(report, coverage);
  await upsertComment(body);
  log("Terminé.");
}

main().catch((e) => {
  // Consultatif : on n'échoue jamais la CI.
  log(`Erreur non bloquante : ${e instanceof Error ? e.message : e}`);
  process.exit(0);
});
