"use client";

import { useEffect, useState } from "react";
import LZString from "lz-string";
import { Button } from "@/components/ui/Button";
import { loadPoll, savePoll } from "@/lib/db";
import {
  addOption,
  mergePolls,
  tally,
  toggleVote,
  type Poll,
} from "@/lib/collab/poll";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

function decodePollParam(): Poll | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("poll");
  if (!param) return null;
  try {
    // « + » → espace lors de la lecture de la query string : on le restaure
    // avant décompression (même correctif que le partage de carnet).
    const json = LZString.decompressFromEncodedURIComponent(param.replace(/ /g, "+"));
    return json ? (JSON.parse(json) as Poll) : null;
  } catch {
    return null;
  }
}

export function ActivityVote() {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [voter, setVoter] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadPoll().then((stored) => {
      if (!active) return;
      // Fusionne un sondage partagé reçu par URL (collaboration sans serveur).
      const shared = decodePollParam();
      const merged = shared ? mergePolls(stored, shared) : stored;
      setPoll(merged);
      if (shared) void savePoll(merged);
    });
    return () => {
      active = false;
    };
  }, []);

  function update(next: Poll) {
    setPoll(next);
    void savePoll(next);
  }

  function vote(optionId: string) {
    if (!poll || !voter.trim()) return;
    update(toggleVote(poll, voter, optionId));
  }

  function addActivity() {
    if (!poll || !newActivity.trim()) return;
    update(addOption(poll, newActivity));
    setNewActivity("");
  }

  async function share() {
    if (!poll) return;
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(poll));
    const url = `${window.location.origin}/collaboration?poll=${encoded}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setShareMsg("Lien de vote copié — partagez-le à la famille !");
    setTimeout(() => setShareMsg(null), 4000);
  }

  if (!poll) {
    return (
      <section className="card p-5" aria-busy="true">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Chargement du vote…
        </p>
      </section>
    );
  }

  const ranked = tally(poll);
  const myVotes = new Set(poll.votes.filter((v) => v.voter === voter.trim()).map((v) => v.optionId));

  return (
    <div className="space-y-5">
      <section className="card p-5 space-y-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Votre prénom
          </span>
          <input
            value={voter}
            onChange={(e) => setVoter(e.target.value)}
            placeholder="Ex. Andy"
            className="h-11 px-3 rounded-lg text-sm"
            style={inputStyle}
          />
        </label>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Approuvez les activités qui vous tentent. Plusieurs choix possibles.
        </p>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
          Activités proposées
        </h2>
        <ul className="space-y-2">
          {ranked.map((t) => {
            const mine = myVotes.has(t.optionId);
            return (
              <li
                key={t.optionId}
                className="flex items-start justify-between gap-3 p-3 rounded-lg"
                style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {t.label}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {t.count} vote{t.count > 1 ? "s" : ""}
                    {t.voters.length > 0 ? ` · ${t.voters.join(", ")}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={mine}
                  disabled={!voter.trim()}
                  onClick={() => vote(t.optionId)}
                  className="h-11 px-4 rounded-lg text-sm font-semibold shrink-0 disabled:opacity-50"
                  style={{
                    background: mine ? "var(--accent-amber)" : "var(--bg-surface)",
                    color: mine ? "var(--text-on-amber)" : "var(--text-primary)",
                    border: `1px solid ${mine ? "var(--accent-amber)" : "var(--border-default)"}`,
                  }}
                >
                  {mine ? "✓ Approuvé" : "Voter"}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex gap-2 pt-1">
          <input
            aria-label="Nouvelle activité"
            value={newActivity}
            onChange={(e) => setNewActivity(e.target.value)}
            placeholder="Proposer une activité…"
            className="h-11 px-3 rounded-lg text-sm flex-1"
            style={inputStyle}
          />
          <Button variant="secondary" onClick={addActivity}>
            Ajouter
          </Button>
        </div>
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
          Partager le vote
        </h2>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Envoyez le lien : les votes reçus seront fusionnés automatiquement (sans serveur).
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={share}>Copier le lien de vote</Button>
          {shareMsg && (
            <span className="text-xs" style={{ color: "var(--accent-success)" }}>
              {shareMsg}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
