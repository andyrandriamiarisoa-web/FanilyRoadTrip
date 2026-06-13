"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  addExpense,
  deleteExpense,
  listExpenses,
  loadBudgetSettings,
  saveBudgetSettings,
} from "@/lib/db";
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  budgetStatus,
  settleBalances,
  totalByCategory,
  totalSpent,
  travelerBalances,
  type Expense,
  type ExpenseCategory,
} from "@/lib/budget/budget";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

const eur = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export function BudgetManager() {
  const [travelers, setTravelers] = useState<string[]>([]);
  const [budgets, setBudgets] = useState<Partial<Record<ExpenseCategory, number>>>({});
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulaire d'ajout
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [date, setDate] = useState("2026-08-03");
  const [paidBy, setPaidBy] = useState("");
  const [splitAmong, setSplitAmong] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([loadBudgetSettings(), listExpenses()]).then(([settings, exp]) => {
      if (!active) return;
      setTravelers(settings.travelers);
      setBudgets(settings.budgets);
      setExpenses(exp);
      setPaidBy(settings.travelers[0] ?? "");
      setSplitAmong(settings.travelers);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function persistTravelers(next: string[]) {
    setTravelers(next);
    await saveBudgetSettings({ travelers: next, budgets });
    setPaidBy((p) => (next.includes(p) ? p : (next[0] ?? "")));
    setSplitAmong((s) => s.filter((x) => next.includes(x)));
  }

  async function submit() {
    if (!label.trim() || amount <= 0 || !paidBy) return;
    const expense: Expense = {
      id: crypto.randomUUID(),
      category,
      label: label.trim(),
      amountEur: amount,
      date,
      paidBy,
      splitAmong: splitAmong.length > 0 ? splitAmong : [paidBy],
    };
    await addExpense(expense);
    setExpenses((prev) => [...prev, expense]);
    setLabel("");
    setAmount(0);
  }

  async function remove(id: string) {
    await deleteExpense(id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading) {
    return (
      <section className="card p-5" aria-busy="true">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Chargement du budget…
        </p>
      </section>
    );
  }

  const total = totalSpent(expenses);
  const byCategory = totalByCategory(expenses);
  const lines = budgetStatus(expenses, budgets);
  const balances = travelerBalances(expenses, travelers);
  const settlements = settleBalances(balances);
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (v ?? 0), 0);

  function toggleSplit(t: string) {
    setSplitAmong((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  }

  return (
    <div className="space-y-5">
      <section className="card p-5 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Budget du voyage
          </h2>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {eur(total)} dépensés / {eur(totalBudget)}
          </span>
        </div>
        <ProgressBar value={total} max={totalBudget} />
      </section>

      {/* Voyageurs */}
      <section className="card p-5 space-y-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Voyageurs
        </h3>
        <input
          aria-label="Voyageurs (séparés par des virgules)"
          value={travelers.join(", ")}
          onChange={(e) =>
            void persistTravelers(
              e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            )
          }
          className="h-11 px-3 rounded-lg w-full text-sm"
          style={inputStyle}
        />
      </section>

      {/* Ajout de dépense */}
      <section className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Ajouter une dépense
        </h3>
        <input
          aria-label="Libellé"
          placeholder="Libellé (ex. Hôtel Dijon)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-11 px-3 rounded-lg w-full text-sm"
          style={inputStyle}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            aria-label="Montant en euros"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={Number.isNaN(amount) ? "" : amount}
            onChange={(e) => setAmount(e.target.valueAsNumber)}
            className="h-11 px-3 rounded-lg text-sm"
            style={inputStyle}
          />
          <select
            aria-label="Catégorie"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="h-11 px-3 rounded-lg text-sm"
            style={inputStyle}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            aria-label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 px-3 rounded-lg text-sm"
            style={inputStyle}
          />
          <select
            aria-label="Payé par"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            className="h-11 px-3 rounded-lg text-sm"
            style={inputStyle}
          >
            {travelers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div role="group" aria-label="Partagé entre" className="space-y-1.5">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Partagé entre :
          </span>
          <div className="flex flex-wrap gap-2">
            {travelers.map((t) => {
              const on = splitAmong.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSplit(t)}
                  className="h-11 px-3 rounded-lg text-sm font-medium"
                  style={{
                    background: on ? "var(--accent-amber)" : "var(--bg-base)",
                    color: on ? "var(--text-on-amber)" : "var(--text-secondary)",
                    border: `1px solid ${on ? "var(--accent-amber)" : "var(--border-default)"}`,
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <Button onClick={submit}>Ajouter</Button>
      </section>

      {/* Ventilation par poste */}
      {byCategory.length > 0 && (
        <section className="card p-5 space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Ventilation par poste
          </h3>
          {lines.map((l) => (
            <div key={l.category} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--text-primary)" }}>{l.label}</span>
                <span className="flex items-center gap-2">
                  <span style={{ color: "var(--text-secondary)" }}>
                    {eur(l.spentEur)} / {eur(l.budgetEur)}
                  </span>
                  {l.overBudget && <span className="badge-danger">dépassé</span>}
                </span>
              </div>
              <ProgressBar value={l.spentEur} max={l.budgetEur} danger={l.overBudget} />
            </div>
          ))}
        </section>
      )}

      {/* Découpage entre voyageurs */}
      {expenses.length > 0 && (
        <section className="card p-5 space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Découpage des dépenses
          </h3>
          <ul className="space-y-1 text-sm">
            {balances.map((b) => (
              <li key={b.traveler} className="flex items-center justify-between">
                <span style={{ color: "var(--text-primary)" }}>{b.traveler}</span>
                <span
                  style={{
                    color:
                      b.netEur > 0
                        ? "var(--accent-success)"
                        : b.netEur < 0
                          ? "var(--accent-danger)"
                          : "var(--text-secondary)",
                  }}
                >
                  {b.netEur > 0 ? "+" : ""}
                  {eur(b.netEur)}
                </span>
              </li>
            ))}
          </ul>
          {settlements.length > 0 ? (
            <div className="space-y-1 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                Règlements suggérés :
              </p>
              {settlements.map((s, i) => (
                <p key={i} className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {s.from} → {s.to} : <strong style={{ color: "var(--text-primary)" }}>{eur(s.amountEur)}</strong>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--accent-success)" }}>
              Comptes équilibrés.
            </p>
          )}
        </section>
      )}

      {/* Liste des dépenses */}
      {expenses.length > 0 && (
        <section className="card p-5 space-y-2">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Dépenses ({expenses.length})
          </h3>
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {e.label}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {CATEGORY_LABELS[e.category]} · {e.date} · {e.paidBy}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {eur(e.amountEur)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(e.id)}
                    aria-label={`Supprimer ${e.label}`}
                    className="text-xs underline"
                    style={{ color: "var(--accent-danger)", minHeight: "auto", minWidth: "auto" }}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProgressBar({ value, max, danger }: { value: number; max: number; danger?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = danger || value > max ? "var(--accent-danger)" : "var(--accent-success)";
  return (
    <div
      className="h-2 rounded-full overflow-hidden"
      style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
