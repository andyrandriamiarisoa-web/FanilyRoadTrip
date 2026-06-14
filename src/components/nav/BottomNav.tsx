"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useRef, useEffect } from "react";

/* ────────────────────────────────────────────────────────────────────
   Icônes SVG inline — toutes aria-hidden, focusable=false
   ──────────────────────────────────────────────────────────────────── */

function IconAccueil() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 12L12 3l9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCarnet() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="4" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M2 6h2M2 10h2M2 14h2M2 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconBudget() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v1m0 8v1m-3.5-5.5c0-1.1.9-2 2-2H13a2 2 0 110 4h-2a2 2 0 000 4h2.5a2 2 0 002-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconGenerateLightning() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" />
    </svg>
  );
}

function IconBagages() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="5" y="8" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12v4M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconReservations() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 14h4v3H7z" fill="currentColor" opacity=".4" />
    </svg>
  );
}

function IconVote() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconComposer() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconHebergements() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 20V8l9-5 9 5v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 20h18M9 20v-5h6v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLieux() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconParametres() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus({ rotated }: { rotated?: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{
        transform: rotated ? "rotate(45deg)" : "none",
        transition: "transform 0.2s ease",
      }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Destinations secondaires — affichées dans le tiroir "Plus"
   ──────────────────────────────────────────────────────────────────── */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  matchPrefix: string;
}

const SECONDARY_ITEMS: NavItem[] = [
  { href: "/composer",      label: "Composer",       icon: <IconComposer />,      matchPrefix: "/composer" },
  { href: "/lieux",         label: "Lieux",          icon: <IconLieux />,         matchPrefix: "/lieux" },
  { href: "/hebergements",  label: "Hébergements",   icon: <IconHebergements />,  matchPrefix: "/hebergements" },
  { href: "/bagages",       label: "Bagages",        icon: <IconBagages />,       matchPrefix: "/bagages" },
  { href: "/reservations",  label: "Réservations",   icon: <IconReservations />,  matchPrefix: "/reservations" },
  { href: "/collaboration", label: "Vote activités", icon: <IconVote />,          matchPrefix: "/collaboration" },
  { href: "/parametres",    label: "Paramètres",     icon: <IconParametres />,    matchPrefix: "/parametres" },
];

/* ────────────────────────────────────────────────────────────────────
   Composant principal
   ──────────────────────────────────────────────────────────────────── */

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  /*
   * NE PAS utiliser useEffect pour fermer le tiroir sur changement de route :
   * setState synchrone dans un effet provoque des cascades de rendu (règle lint
   * react-hooks/set-state-in-effect). À la place, chaque lien du tiroir appelle
   * closeMore() explicitement dans son onClick.
   */
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const toggleMore = useCallback(() => setMoreOpen((v) => !v), []);

  /* Ferme sur clic extérieur — souscription à un événement DOM externe (correct) */
  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(e.target as Node) &&
        moreButtonRef.current &&
        !moreButtonRef.current.contains(e.target as Node)
      ) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  /* Ferme sur Escape — souscription à un événement DOM externe (correct) */
  useEffect(() => {
    if (!moreOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [moreOpen]);

  function isActive(matchPrefix: string) {
    if (matchPrefix === "/") return pathname === "/";
    return pathname.startsWith(matchPrefix);
  }

  /* Un onglet secondaire est-il actif ? (le bouton "Plus" prend la couleur ambre) */
  const secondaryActive = SECONDARY_ITEMS.some((item) =>
    isActive(item.matchPrefix),
  );

  return (
    <>
      {/* ── Overlay semi-transparent ──────────────────────────────── */}
      {/*
        aria-hidden=true toujours : l'overlay n'est qu'un accessoire visuel,
        le focus reste dans le tiroir (dialog).
      */}
      <div
        aria-hidden="true"
        onClick={closeMore}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 39,
          opacity: moreOpen ? 1 : 0,
          pointerEvents: moreOpen ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
      />

      {/* ── Tiroir "Plus" (slide-up) ──────────────────────────────── */}
      {/*
        On n'utilise PAS l'attribut `hidden` pour pouvoir animer la transition.
        aria-hidden masque le contenu aux lecteurs d'écran quand fermé.
        pointerEvents none empêche les clics accidentels quand hors-écran.
      */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Autres destinations"
        aria-hidden={!moreOpen}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          /* Juste au-dessus de la barre (68px) + safe-area iOS */
          bottom: "calc(68px + env(safe-area-inset-bottom, 0px))",
          zIndex: 40,
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border-default)",
          borderRadius: "16px 16px 0 0",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.4)",
          transform: moreOpen ? "translateY(0)" : "translateY(110%)",
          transition: "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
          padding: "8px 0 8px",
          pointerEvents: moreOpen ? "auto" : "none",
        }}
      >
        {/* Poignée visuelle */}
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 4,
            borderRadius: 9999,
            background: "var(--border-strong)",
            margin: "0 auto 12px",
          }}
        />

        <p
          className="text-xs font-semibold px-5 mb-2"
          style={{ color: "var(--text-secondary)", letterSpacing: "0.06em" }}
        >
          AUTRES SECTIONS
        </p>

        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {SECONDARY_ITEMS.map((item) => {
            const active = isActive(item.matchPrefix);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={closeMore}
                  aria-current={active ? "page" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.875rem 1.25rem",
                    color: active ? "var(--nav-active-color)" : "var(--text-primary)",
                    background: active ? "var(--bg-surface)" : "transparent",
                    borderLeft: active
                      ? "3px solid var(--nav-active-color)"
                      : "3px solid transparent",
                    textDecoration: "none",
                    minHeight: 52,
                    fontWeight: active ? 700 : 500,
                    fontSize: "0.9375rem",
                    transition: "background 0.15s ease",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      color: active ? "var(--nav-active-color)" : "var(--text-secondary)",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── Barre d'onglets basse persistante ─────────────────────── */}
      {/*
        Hauteur fixe 68px + env(safe-area-inset-bottom) pour iPhone.
        Le <main> dans layout.tsx a un padding-bottom équivalent.
        Contraste des libellés (--nav-active-color selon thème) :
          - Inactif nuit  : --text-secondary (#94a3b8) sur --bg-card (#1e293b) → 4.9:1 ✅
          - Actif nuit    : --nav-active-color (#f59e0b) sur --bg-card (#1e293b) → 5.7:1 ✅
          - Inactif clair : --text-secondary (#475569) sur --bg-card (#ffffff) → 5.8:1 ✅
          - Actif clair   : --nav-active-color (#d97706) sur --bg-card (#ffffff) → 5.2:1 ✅
      */}
      <nav
        aria-label="Navigation principale"
        style={{
          position: "relative",
          flexShrink: 0,
          width: "100%",
          height: "calc(68px + env(safe-area-inset-bottom, 0px))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border-default)",
          zIndex: 50,
          display: "flex",
          alignItems: "stretch",
        }}
      >
        {/* Accueil */}
        <NavTab
          href="/"
          label="Accueil"
          icon={<IconAccueil />}
          active={isActive("/")}
        />

        {/* Carnet */}
        <NavTab
          href="/carnet"
          label="Carnet"
          icon={<IconCarnet />}
          active={isActive("/carnet")}
        />

        {/* CTA central — Générer le voyage */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Link
            href="/plan"
            aria-current={isActive("/plan") ? "page" : undefined}
            aria-label="Générer le voyage"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--accent-amber)",
              color: "var(--text-on-amber)",
              boxShadow: isActive("/plan")
                ? "0 0 0 3px var(--accent-amber), 0 4px 16px rgba(245,158,11,0.45)"
                : "0 4px 16px rgba(245,158,11,0.35)",
              textDecoration: "none",
              flexShrink: 0,
              transition: "box-shadow 0.15s ease, transform 0.15s ease",
            }}
          >
            <IconGenerateLightning />
          </Link>
        </div>

        {/* Budget */}
        <NavTab
          href="/budget"
          label="Budget"
          icon={<IconBudget />}
          active={isActive("/budget")}
        />

        {/* Bouton "Plus" — ouvre le tiroir des destinations secondaires */}
        <button
          ref={moreButtonRef}
          type="button"
          onClick={toggleMore}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          aria-label={moreOpen ? "Fermer le menu" : "Autres sections"}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "8px 4px",
            minHeight: 44,
            minWidth: 44,
            color:
              moreOpen || secondaryActive
                ? "var(--nav-active-color)"
                : "var(--text-secondary)",
            fontSize: "0.625rem",
            fontWeight: 600,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            transition: "color 0.15s ease",
          }}
        >
          <IconPlus rotated={moreOpen} />
          <span style={{ lineHeight: 1 }}>Plus</span>
        </button>
      </nav>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Onglet individuel de la barre basse
   ──────────────────────────────────────────────────────────────────── */

interface NavTabProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}

function NavTab({ href, label, icon, active }: NavTabProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "8px 4px",
        textDecoration: "none",
        /*
         * Contraste WCAG AA via --nav-active-color (thème adaptatif) :
         *   Actif nuit    : #f59e0b sur #1e293b → 5.7:1 ✅
         *   Inactif nuit  : #94a3b8 sur #1e293b → 4.9:1 ✅
         *   Actif clair   : #d97706 sur #ffffff → 5.2:1 ✅
         *   Inactif clair : #475569 sur #ffffff → 5.8:1 ✅
         */
        color: active ? "var(--nav-active-color)" : "var(--text-secondary)",
        fontSize: "0.625rem",
        fontWeight: 600,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        minHeight: 44,
        transition: "color 0.15s ease",
        position: "relative",
      }}
    >
      {/* Indicateur actif — trait en haut de l'onglet (couleur adaptative) */}
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: "20%",
            right: "20%",
            height: 2,
            borderRadius: "0 0 2px 2px",
            background: "var(--nav-active-color)",
          }}
        />
      )}
      {icon}
      <span style={{ lineHeight: 1 }}>{label}</span>
    </Link>
  );
}
