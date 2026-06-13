"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Assistant de configuration Tesla (mode réel) — pensé pour le mobile.
 *
 * Génère, **côté navigateur** (Web Crypto), le secret de chiffrement et la
 * paire de clés EC P-256 exigée par Tesla : la clé privée n'est jamais envoyée
 * à un serveur, l'utilisateur la copie directement dans ses variables Vercel.
 * Déclenche aussi l'enregistrement du domaine (plus besoin de curl).
 */

interface Generated {
  tokenSecret: string;
  publicPem: string;
  privatePem: string;
}

function abToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function toPem(base64: string, label: string): string {
  const lines = base64.match(/.{1,64}/g) ?? [base64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

/** Libellé court de région à partir de la base Fleet API. */
function regionLabel(audience: string): string {
  if (audience.includes(".eu.")) return "Europe";
  if (audience.includes(".na.")) return "Amérique du Nord";
  if (audience.includes(".cn")) return "Chine";
  return audience;
}

async function generateMaterial(): Promise<Generated> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);

  return {
    tokenSecret: abToBase64(secret.buffer),
    publicPem: toPem(abToBase64(spki), "PUBLIC KEY"),
    privatePem: toPem(abToBase64(pkcs8), "PRIVATE KEY"),
  };
}

export function TeslaSetupAssistant() {
  const [material, setMaterial] = useState<Generated | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerMsg, setRegisterMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const generate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    try {
      setMaterial(await generateMaterial());
    } catch (e) {
      setGenError(
        e instanceof Error ? e.message : "Génération impossible sur ce navigateur.",
      );
    } finally {
      setGenerating(false);
    }
  }, []);

  async function register() {
    setRegistering(true);
    setRegisterMsg(null);
    try {
      const res = await fetch("/api/tesla/partner/register", { method: "POST" });
      const data = await res.json();
      const regions: { audience: string; ok: boolean; error?: string }[] = data.regions ?? [];
      if (res.ok && data.ok) {
        const okList = regions.filter((r) => r.ok).map((r) => regionLabel(r.audience)).join(", ");
        setRegisterMsg({ ok: true, text: `Domaine ${data.domain} enregistré : ${okList || "OK"}.` });
      } else {
        const detail = regions
          .filter((r) => !r.ok)
          .map((r) => `${regionLabel(r.audience)} : ${r.error}`)
          .join(" · ");
        setRegisterMsg({ ok: false, text: detail || data.error || "Enregistrement impossible." });
      }
    } catch (e) {
      setRegisterMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Erreur réseau.",
      });
    } finally {
      setRegistering(false);
    }
  }

  return (
    <details className="card p-5">
      <summary
        className="font-semibold cursor-pointer"
        style={{ color: "var(--text-primary)" }}
      >
        Configuration Tesla (mode réel) — avancé
      </summary>

      <div className="space-y-4 mt-4">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Pour activer la connexion Tesla réelle sans terminal. Les clés sont
          générées sur cet appareil ; la clé privée ne quitte jamais votre
          navigateur — vous la collez vous-même dans Vercel.
        </p>

        {/* Étape 1 — génération */}
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            1. Générer les clés
          </p>
          <Button onClick={generate} loading={generating} size="sm">
            Générer le secret et la paire de clés
          </Button>
          {genError && (
            <p className="text-sm" role="alert" style={{ color: "var(--accent-danger)" }}>
              {genError}
            </p>
          )}
        </div>

        {material && (
          <div className="space-y-3">
            <CopyField
              label="TESLA_TOKEN_SECRET"
              value={material.tokenSecret}
              hint="Chiffre les jetons. Collez-le dans les variables Vercel."
            />
            <CopyField
              label="TESLA_PUBLIC_KEY_PEM"
              value={material.publicPem}
              hint="Clé publique servie sous /.well-known — collez-la dans Vercel."
            />
            <CopyField
              label="⚠ Clé privée (à conserver en lieu sûr)"
              value={material.privatePem}
              hint="Nécessaire uniquement pour les commandes signées (véhicules 2021+). Gardez-la secrète ; ne la commitez jamais."
            />
          </div>
        )}

        {/* Étape 2 — variables Vercel */}
        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            2. Renseigner les variables Vercel, puis redéployer
          </p>
          <ul
            className="text-sm list-disc pl-5 space-y-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            <li><code>NEXT_PUBLIC_APP_MODE</code> = <code>live</code></li>
            <li><code>TESLA_CLIENT_ID</code> / <code>TESLA_CLIENT_SECRET</code> (console Tesla)</li>
            <li><code>TESLA_REDIRECT_URI</code> = <code>https://&lt;domaine&gt;/api/tesla/callback</code></li>
            <li><code>TESLA_TOKEN_SECRET</code> et <code>TESLA_PUBLIC_KEY_PEM</code> (ci-dessus)</li>
          </ul>
        </div>

        {/* Étape 3 — enregistrement du domaine */}
        <div className="space-y-2">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            3. Enregistrer le domaine auprès de Tesla
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            À faire une fois, après le redéploiement en mode réel.
          </p>
          <Button onClick={register} loading={registering} size="sm" variant="secondary">
            Enregistrer le domaine Tesla
          </Button>
          {registerMsg && (
            <p
              className="text-sm rounded-lg px-3 py-2"
              role={registerMsg.ok ? "status" : "alert"}
              style={{
                background: registerMsg.ok ? "var(--badge-verified-bg)" : "var(--badge-danger-bg)",
                color: registerMsg.ok ? "var(--badge-verified-text)" : "var(--badge-danger-text)",
              }}
            >
              {registerMsg.text}
            </p>
          )}
        </div>

        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          4. Revenez ci-dessus et touchez <strong>« Connecter mon compte Tesla »</strong>.
          Guide complet : <code>docs/TESLA.md</code>.
        </p>
      </div>
    </details>
  );
}

function CopyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const fieldId = `tesla-field-${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={fieldId}
          className="text-xs font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </label>
        <button
          type="button"
          onClick={copy}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
      <textarea
        id={fieldId}
        readOnly
        value={value}
        rows={value.includes("\n") ? 4 : 1}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full text-xs font-mono rounded-lg p-2 resize-none"
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
        }}
      />
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {hint}
      </p>
    </div>
  );
}
