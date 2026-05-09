/**
 * Serveur MCP – PENNYLANE CABINET (API Firm)
 * ADALTA – Perpignan
 *
 * Source : API officielle Pennylane Firm V1
 * Base URL : https://app.pennylane.com/api/external/firm/v1
 * Transport : SSE pour Claude.ai Connectors
 * Déployé sur : Render
 *
 * Variable d'environnement requise :
 *   PENNYLANE_FIRM_TOKEN → Firm Token généré depuis Paramètres cabinet → Firm Tokens
 *
 * Outils exposés :
 *   CABINET
 *   1.  liste_dossiers              → tous les dossiers clients du cabinet
 *   2.  detail_dossier              → détail d'un dossier client
 *   3.  exercices_fiscaux           → exercices fiscaux d'un dossier
 *
 *   COMPTABILITÉ
 *   4.  balance_comptable           → balance générale d'un dossier
 *   5.  grand_livre                 → grand livre (écritures) d'un dossier
 *   6.  plan_comptable              → plan comptable d'un dossier
 *
 *   FACTURATION
 *   7.  factures_clients            → factures clients d'un dossier
 *   8.  detail_facture_client       → détail d'une facture client
 *   9.  factures_fournisseurs       → factures fournisseurs d'un dossier
 *   10. detail_facture_fournisseur  → détail d'une facture fournisseur
 *
 *   TIERS
 *   11. liste_clients               → tiers clients d'un dossier
 *   12. liste_fournisseurs          → tiers fournisseurs d'un dossier
 *
 *   TRÉSORERIE
 *   13. transactions_bancaires      → transactions bancaires d'un dossier
 *   14. comptes_bancaires           → comptes bancaires d'un dossier
 *
 *   GED
 *   15. documents_ged               → documents GED du cabinet ou d'un dossier
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

// ─────────────────────────────────────────────
// 1. CONFIGURATION
// ─────────────────────────────────────────────

const PORT  = process.env.PORT || 3000;
const TOKEN = process.env.PENNYLANE_FIRM_TOKEN;

const FIRM_BASE    = "https://app.pennylane.com/api/external/firm/v1";
const COMPANY_BASE = "https://app.pennylane.com/api/external/v2";

// ─────────────────────────────────────────────
// 2. CLIENT HTTP
// ─────────────────────────────────────────────

async function plFetch(url, params = {}) {
  const fullUrl = new URL(url);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      fullUrl.searchParams.set(k, String(v));
    }
  });

  const resp = await fetch(fullUrl.toString(), {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept:        "application/json",
      "Content-Type": "application/json",
    },
  });

  if (resp.status === 404) return null;
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Pennylane API ${resp.status}: ${txt}`);
  }
  return resp.json();
}

// ─────────────────────────────────────────────
// 3. UTILITAIRES DE FORMATAGE
// ─────────────────────────────────────────────

function formatDossier(c) {
  return [
    `**ID :** ${c.id}`,
    `**Nom :** ${c.name ?? c.billing_name ?? "—"}`,
    `**SIREN :** ${c.reg_no ?? c.siren ?? "—"}`,
    `**Email :** ${c.email ?? "—"}`,
    `**Plan :** ${c.plan ?? "—"}`,
    `**Clôture :** ${c.fiscal_year_end_month ?? "—"}`,
  ].filter(line => !line.endsWith("—")).join("\n");
}

function formatFacture(f) {
  return [
    `**Numéro :** ${f.invoice_number ?? f.id}`,
    `**Date :** ${f.date ?? "—"}`,
    `**Tiers :** ${f.customer?.name ?? f.supplier?.name ?? f.company_name ?? "—"}`,
    `**Montant HT :** ${f.amount ?? "—"} €`,
    `**Montant TTC :** ${f.amount_including_tax ?? "—"} €`,
    `**Statut :** ${f.status ?? "—"}`,
    `**Devise :** ${f.currency ?? "EUR"}`,
  ].join("\n");
}

function formatTransaction(t) {
  return [
    `**Date :** ${t.date ?? "—"}`,
    `**Libellé :** ${t.label ?? t.description ?? "—"}`,
    `**Montant :** ${t.amount ?? "—"} ${t.currency ?? "EUR"}`,
    `**Statut :** ${t.status ?? "—"}`,
    `**Compte :** ${t.account_label ?? t.bank_account?.name ?? "—"}`,
  ].join("\n");
}

// ─────────────────────────────────────────────
// 4. CRÉATION DU SERVEUR MCP
// ─────────────────────────────────────────────

function buildMcpServer() {
  const server = new McpServer({ name: "pennylane-mcp", version: "1.0.0" });

  // ══════════════════════════════════════════
  // CABINET — DOSSIERS CLIENTS
  // ══════════════════════════════════════════

  server.tool(
    "liste_dossiers",
    `Liste tous les dossiers clients du cabinet ADALTA dans Pennylane.
Retourne : ID Pennylane, nom, SIREN, email, plan, clôture de chaque dossier.
Utiliser cet outil en premier pour obtenir les IDs des dossiers avant toute autre requête.`,
    {
      page:   z.number().int().min(1).default(1),
      limit:  z.number().int().min(1).max(100).default(50),
    },
    async ({ page, limit }) => {
      const data = await plFetch(`${FIRM_BASE}/companies`, { page, per_page: limit });
      if (!data) return { content: [{ type: "text", text: "Aucun dossier trouvé." }] };

      const companies = data.companies ?? data.data ?? data ?? [];
      const total = data.total_pages ?? "?";

      if (!companies.length) return { content: [{ type: "text", text: "Aucun dossier client dans ce cabinet." }] };

      const lines = companies.map((c, i) => `${i + 1}. ${formatDossier(c)}`);
      return {
        content: [{
          type: "text",
          text: `**${companies.length} dossier(s) — Page ${page}/${total} :**\n\n` + lines.join("\n\n"),
        }],
      };
    }
  );

  server.tool(
    "detail_dossier",
    `Récupère les informations détaillées d'un dossier client Pennylane.
Utiliser après liste_dossiers pour obtenir l'ID du dossier cible.`,
    { company_id: z.number().int().positive("ID dossier Pennylane requis") },
    async ({ company_id }) => {
      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}`);
      if (!data) return { content: [{ type: "text", text: `Dossier ${company_id} introuvable.` }] };

      const c = data.company ?? data;
      const lines = [
        `**Source : Pennylane Firm API**`,
        `**ID :** ${c.id}`,
        `**Nom :** ${c.name ?? "—"}`,
        `**SIREN :** ${c.reg_no ?? "—"}`,
        `**Email :** ${c.email ?? "—"}`,
        `**Téléphone :** ${c.phone ?? "—"}`,
        `**Adresse :** ${[c.address, c.postal_code, c.city].filter(Boolean).join(", ")}`,
        `**Plan Pennylane :** ${c.plan ?? "—"}`,
        `**Clôture exercice :** mois ${c.fiscal_year_end_month ?? "—"}`,
        `**Devise :** ${c.currency ?? "EUR"}`,
        `**TVA :** ${c.vat_number ?? "—"}`,
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "exercices_fiscaux",
    `Liste les exercices fiscaux d'un dossier client Pennylane.
Retourne les dates de début et de fin de chaque exercice, et leur statut (ouvert/clôturé).
Utile avant de demander une balance ou un grand livre pour cibler le bon exercice.`,
    { company_id: z.number().int().positive() },
    async ({ company_id }) => {
      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/fiscal_years`);
      if (!data) return { content: [{ type: "text", text: `Exercices introuvables pour le dossier ${company_id}.` }] };

      const years = data.fiscal_years ?? data.data ?? data ?? [];
      if (!years.length) return { content: [{ type: "text", text: "Aucun exercice fiscal trouvé." }] };

      const lines = years.map((y, i) =>
        `${i + 1}. **ID ${y.id}** | ${y.start_date} → ${y.end_date} | ${y.closed_at ? "✅ Clôturé" : "🔓 Ouvert"}`
      );
      return { content: [{ type: "text", text: `**Exercices fiscaux — Dossier ${company_id} :**\n\n` + lines.join("\n") }] };
    }
  );

  // ══════════════════════════════════════════
  // COMPTABILITÉ
  // ══════════════════════════════════════════

  server.tool(
    "balance_comptable",
    `Récupère la balance générale d'un dossier client Pennylane.
Paramètres optionnels : exercise fiscal (fiscal_year_id), filtre par compte (account_number).
Retourne les soldes débiteurs et créditeurs par compte comptable.`,
    {
      company_id:     z.number().int().positive(),
      fiscal_year_id: z.number().int().positive().optional(),
      account_number: z.string().optional().describe("Filtrer sur un numéro de compte (ex: '401' pour fournisseurs)"),
    },
    async ({ company_id, fiscal_year_id, account_number }) => {
      const params = {};
      if (fiscal_year_id) params.fiscal_year_id = fiscal_year_id;
      if (account_number) params.account_number = account_number;

      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/trial_balance`, params);
      if (!data) return { content: [{ type: "text", text: `Balance introuvable pour le dossier ${company_id}.` }] };

      const accounts = data.accounts ?? data.data ?? data ?? [];
      if (!accounts.length) return { content: [{ type: "text", text: "Balance vide pour cette période." }] };

      const lines = accounts.slice(0, 100).map(a => {
        const debit  = parseFloat(a.debit_amount  ?? a.debit  ?? 0).toFixed(2);
        const credit = parseFloat(a.credit_amount ?? a.credit ?? 0).toFixed(2);
        const solde  = parseFloat(a.balance ?? (parseFloat(debit) - parseFloat(credit))).toFixed(2);
        return `**${a.number ?? a.account_number}** — ${a.name ?? a.label ?? "—"} | D: ${debit} € | C: ${credit} € | Solde: **${solde} €**`;
      });

      const affichés = Math.min(accounts.length, 100);
      return {
        content: [{
          type: "text",
          text: `**Balance générale — Dossier ${company_id} (${affichés}/${accounts.length} comptes) :**\n\n` + lines.join("\n"),
        }],
      };
    }
  );

  server.tool(
    "grand_livre",
    `Récupère les écritures comptables (grand livre) d'un dossier client Pennylane.
Filtrage possible par compte, période, exercice fiscal.
Retourne les lignes d'écriture avec date, libellé, compte, débit, crédit.`,
    {
      company_id:     z.number().int().positive(),
      fiscal_year_id: z.number().int().positive().optional(),
      account_number: z.string().optional().describe("Filtrer sur un compte (ex: '411', '401', '512')"),
      date_from:      z.string().optional().describe("Date de début YYYY-MM-DD"),
      date_to:        z.string().optional().describe("Date de fin YYYY-MM-DD"),
      limit:          z.number().int().min(1).max(200).default(50),
    },
    async ({ company_id, fiscal_year_id, account_number, date_from, date_to, limit }) => {
      const params = { per_page: limit };
      if (fiscal_year_id) params.fiscal_year_id = fiscal_year_id;
      if (account_number) params.account_number  = account_number;
      if (date_from)      params.date_from        = date_from;
      if (date_to)        params.date_to          = date_to;

      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/ledger_entries`, params);
      if (!data) return { content: [{ type: "text", text: `Grand livre introuvable pour le dossier ${company_id}.` }] };

      const entries = data.ledger_entries ?? data.data ?? data ?? [];
      if (!entries.length) return { content: [{ type: "text", text: "Aucune écriture pour les critères sélectionnés." }] };

      const lines = entries.map((e, i) => {
        const date   = e.date ?? "—";
        const label  = e.label ?? e.description ?? "—";
        const pieces = (e.ledger_entry_lines ?? []).map(l =>
          `  → **${l.account_number ?? "—"}** ${l.account_name ?? ""} | D: ${parseFloat(l.debit ?? 0).toFixed(2)} € | C: ${parseFloat(l.credit ?? 0).toFixed(2)} €`
        ).join("\n");
        return `**${i + 1}. ${date}** — ${label}\n${pieces}`;
      });

      return {
        content: [{
          type: "text",
          text: `**Grand livre — Dossier ${company_id} (${entries.length} écritures) :**\n\n` + lines.join("\n\n"),
        }],
      };
    }
  );

  server.tool(
    "plan_comptable",
    `Récupère le plan comptable d'un dossier client Pennylane.
Retourne la liste des comptes avec leur numéro, libellé et type.`,
    {
      company_id: z.number().int().positive(),
      filtre:     z.string().optional().describe("Filtrer par numéro ou libellé de compte (ex: '6', '401', 'charge')"),
    },
    async ({ company_id, filtre }) => {
      const params = filtre ? { q: filtre } : {};
      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/ledger_accounts`, params);
      if (!data) return { content: [{ type: "text", text: `Plan comptable introuvable pour le dossier ${company_id}.` }] };

      const accounts = data.ledger_accounts ?? data.data ?? data ?? [];
      if (!accounts.length) return { content: [{ type: "text", text: "Aucun compte trouvé." }] };

      const lines = accounts.slice(0, 100).map(a =>
        `**${a.number ?? a.account_number}** — ${a.name ?? a.label ?? "—"} [${a.type ?? "—"}]`
      );
      return {
        content: [{
          type: "text",
          text: `**Plan comptable — Dossier ${company_id} (${Math.min(accounts.length, 100)}/${accounts.length} comptes) :**\n\n` + lines.join("\n"),
        }],
      };
    }
  );

  // ══════════════════════════════════════════
  // FACTURATION
  // ══════════════════════════════════════════

  server.tool(
    "factures_clients",
    `Liste les factures clients d'un dossier Pennylane.
Filtres : statut (draft/finalized/cancelled), date, client.
Retourne numéro, date, client, montant HT et TTC, statut.`,
    {
      company_id: z.number().int().positive(),
      statut:     z.enum(["draft", "finalized", "cancelled"]).optional(),
      date_from:  z.string().optional(),
      date_to:    z.string().optional(),
      limit:      z.number().int().min(1).max(100).default(20),
    },
    async ({ company_id, statut, date_from, date_to, limit }) => {
      const params = { per_page: limit };
      if (statut)    params.status    = statut;
      if (date_from) params.date_from = date_from;
      if (date_to)   params.date_to   = date_to;

      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/customer_invoices`, params);
      if (!data) return { content: [{ type: "text", text: `Factures clients introuvables pour le dossier ${company_id}.` }] };

      const invoices = data.customer_invoices ?? data.invoices ?? data.data ?? data ?? [];
      if (!invoices.length) return { content: [{ type: "text", text: "Aucune facture client trouvée." }] };

      const total = data.total ?? invoices.length;
      const lines = invoices.map((f, i) => `${i + 1}. ${formatFacture(f)}\n   **ID :** ${f.id}`);
      return {
        content: [{
          type: "text",
          text: `**Factures clients — Dossier ${company_id} (${invoices.length}/${total}) :**\n\n` + lines.join("\n\n"),
        }],
      };
    }
  );

  server.tool(
    "detail_facture_client",
    `Récupère le détail complet d'une facture client (lignes, TVA, paiements).`,
    {
      company_id: z.number().int().positive(),
      invoice_id: z.string().min(1, "ID facture requis"),
    },
    async ({ company_id, invoice_id }) => {
      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/customer_invoices/${invoice_id}`);
      if (!data) return { content: [{ type: "text", text: `Facture ${invoice_id} introuvable.` }] };

      const f = data.customer_invoice ?? data.invoice ?? data;
      const lines_fact = (f.invoice_lines ?? []).map((l, i) =>
        `  ${i + 1}. ${l.label ?? l.description ?? "—"} | Qté: ${l.quantity ?? 1} | PU HT: ${l.unit_price ?? "—"} € | Total HT: ${l.amount ?? "—"} €`
      ).join("\n");

      const text = [
        formatFacture(f),
        lines_fact ? `\n**Lignes :**\n${lines_fact}` : "",
        f.notes ? `\n**Notes :** ${f.notes}` : "",
      ].filter(Boolean).join("\n");

      return { content: [{ type: "text", text: `**Facture client — Dossier ${company_id} :**\n\n${text}` }] };
    }
  );

  server.tool(
    "factures_fournisseurs",
    `Liste les factures fournisseurs d'un dossier Pennylane.
Filtres : statut, date, fournisseur.`,
    {
      company_id: z.number().int().positive(),
      statut:     z.enum(["draft", "finalized", "cancelled"]).optional(),
      date_from:  z.string().optional(),
      date_to:    z.string().optional(),
      limit:      z.number().int().min(1).max(100).default(20),
    },
    async ({ company_id, statut, date_from, date_to, limit }) => {
      const params = { per_page: limit };
      if (statut)    params.status    = statut;
      if (date_from) params.date_from = date_from;
      if (date_to)   params.date_to   = date_to;

      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/supplier_invoices`, params);
      if (!data) return { content: [{ type: "text", text: `Factures fournisseurs introuvables pour le dossier ${company_id}.` }] };

      const invoices = data.supplier_invoices ?? data.invoices ?? data.data ?? data ?? [];
      if (!invoices.length) return { content: [{ type: "text", text: "Aucune facture fournisseur trouvée." }] };

      const total = data.total ?? invoices.length;
      const lines = invoices.map((f, i) => `${i + 1}. ${formatFacture(f)}\n   **ID :** ${f.id}`);
      return {
        content: [{
          type: "text",
          text: `**Factures fournisseurs — Dossier ${company_id} (${invoices.length}/${total}) :**\n\n` + lines.join("\n\n"),
        }],
      };
    }
  );

  server.tool(
    "detail_facture_fournisseur",
    `Récupère le détail complet d'une facture fournisseur (lignes, TVA, paiements).`,
    {
      company_id: z.number().int().positive(),
      invoice_id: z.string().min(1),
    },
    async ({ company_id, invoice_id }) => {
      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/supplier_invoices/${invoice_id}`);
      if (!data) return { content: [{ type: "text", text: `Facture fournisseur ${invoice_id} introuvable.` }] };

      const f = data.supplier_invoice ?? data.invoice ?? data;
      const lines_fact = (f.invoice_lines ?? []).map((l, i) =>
        `  ${i + 1}. ${l.label ?? l.description ?? "—"} | Qté: ${l.quantity ?? 1} | PU HT: ${l.unit_price ?? "—"} € | Total HT: ${l.amount ?? "—"} €`
      ).join("\n");

      const text = [formatFacture(f), lines_fact ? `\n**Lignes :**\n${lines_fact}` : ""].filter(Boolean).join("\n");
      return { content: [{ type: "text", text: `**Facture fournisseur — Dossier ${company_id} :**\n\n${text}` }] };
    }
  );

  // ══════════════════════════════════════════
  // TIERS
  // ══════════════════════════════════════════

  server.tool(
    "liste_clients",
    `Liste les tiers clients d'un dossier Pennylane (customers).
Filtres possibles : nom, email, SIREN.`,
    {
      company_id: z.number().int().positive(),
      q:          z.string().optional().describe("Recherche par nom ou email"),
      limit:      z.number().int().min(1).max(100).default(20),
    },
    async ({ company_id, q, limit }) => {
      const params = { per_page: limit };
      if (q) params.q = q;

      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/customers`, params);
      if (!data) return { content: [{ type: "text", text: `Clients introuvables pour le dossier ${company_id}.` }] };

      const customers = data.customers ?? data.data ?? data ?? [];
      if (!customers.length) return { content: [{ type: "text", text: "Aucun client trouvé." }] };

      const lines = customers.map((c, i) =>
        `${i + 1}. **${c.name ?? c.billing_name ?? "—"}** | Email: ${c.email ?? "—"} | SIREN: ${c.reg_no ?? "—"} | ID: ${c.id}`
      );
      return {
        content: [{
          type: "text",
          text: `**Clients — Dossier ${company_id} (${customers.length} résultats) :**\n\n` + lines.join("\n"),
        }],
      };
    }
  );

  server.tool(
    "liste_fournisseurs",
    `Liste les tiers fournisseurs d'un dossier Pennylane (suppliers).`,
    {
      company_id: z.number().int().positive(),
      q:          z.string().optional(),
      limit:      z.number().int().min(1).max(100).default(20),
    },
    async ({ company_id, q, limit }) => {
      const params = { per_page: limit };
      if (q) params.q = q;

      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/suppliers`, params);
      if (!data) return { content: [{ type: "text", text: `Fournisseurs introuvables pour le dossier ${company_id}.` }] };

      const suppliers = data.suppliers ?? data.data ?? data ?? [];
      if (!suppliers.length) return { content: [{ type: "text", text: "Aucun fournisseur trouvé." }] };

      const lines = suppliers.map((s, i) =>
        `${i + 1}. **${s.name ?? "—"}** | Email: ${s.email ?? "—"} | SIREN: ${s.reg_no ?? "—"} | ID: ${s.id}`
      );
      return {
        content: [{
          type: "text",
          text: `**Fournisseurs — Dossier ${company_id} (${suppliers.length} résultats) :**\n\n` + lines.join("\n"),
        }],
      };
    }
  );

  // ══════════════════════════════════════════
  // TRÉSORERIE / BANQUE
  // ══════════════════════════════════════════

  server.tool(
    "transactions_bancaires",
    `Liste les transactions bancaires d'un dossier Pennylane.
Filtres : statut (imported/categorized/reconciled), compte bancaire, période.
Retourne date, libellé, montant, compte, statut de rapprochement.`,
    {
      company_id:      z.number().int().positive(),
      statut:          z.enum(["imported", "categorized", "reconciled"]).optional(),
      date_from:       z.string().optional(),
      date_to:         z.string().optional(),
      bank_account_id: z.number().int().optional().describe("Filtrer sur un compte bancaire précis"),
      limit:           z.number().int().min(1).max(100).default(30),
    },
    async ({ company_id, statut, date_from, date_to, bank_account_id, limit }) => {
      const params = { per_page: limit };
      if (statut)          params.status          = statut;
      if (date_from)       params.date_from        = date_from;
      if (date_to)         params.date_to          = date_to;
      if (bank_account_id) params.bank_account_id  = bank_account_id;

      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/transactions`, params);
      if (!data) return { content: [{ type: "text", text: `Transactions introuvables pour le dossier ${company_id}.` }] };

      const transactions = data.transactions ?? data.data ?? data ?? [];
      if (!transactions.length) return { content: [{ type: "text", text: "Aucune transaction trouvée." }] };

      const total = data.total ?? transactions.length;
      const lines = transactions.map((t, i) => `${i + 1}. ${formatTransaction(t)}`);
      return {
        content: [{
          type: "text",
          text: `**Transactions bancaires — Dossier ${company_id} (${transactions.length}/${total}) :**\n\n` + lines.join("\n\n"),
        }],
      };
    }
  );

  server.tool(
    "comptes_bancaires",
    `Liste les comptes bancaires d'un dossier Pennylane.
Retourne nom, IBAN, solde, banque et statut de synchronisation.`,
    { company_id: z.number().int().positive() },
    async ({ company_id }) => {
      const data = await plFetch(`${FIRM_BASE}/companies/${company_id}/bank_accounts`);
      if (!data) return { content: [{ type: "text", text: `Comptes bancaires introuvables pour le dossier ${company_id}.` }] };

      const accounts = data.bank_accounts ?? data.data ?? data ?? [];
      if (!accounts.length) return { content: [{ type: "text", text: "Aucun compte bancaire trouvé." }] };

      const lines = accounts.map((a, i) =>
        `${i + 1}. **${a.name ?? "—"}** | IBAN: ${a.iban ?? "—"} | Solde: ${a.balance ?? "—"} € | ID: ${a.id}`
      );
      return {
        content: [{
          type: "text",
          text: `**Comptes bancaires — Dossier ${company_id} :**\n\n` + lines.join("\n"),
        }],
      };
    }
  );

  // ══════════════════════════════════════════
  // GED
  // ══════════════════════════════════════════

  server.tool(
    "documents_ged",
    `Accède aux documents de la GED (Gestion Électronique de Documents) du cabinet.
Retourne la liste des documents avec nom, date, type et dossier associé.`,
    {
      company_id: z.number().int().positive().optional().describe("Filtrer sur un dossier précis (optionnel)"),
      limit:      z.number().int().min(1).max(50).default(20),
    },
    async ({ company_id, limit }) => {
      const url    = company_id
        ? `${FIRM_BASE}/companies/${company_id}/documents`
        : `${FIRM_BASE}/documents`;
      const params = { per_page: limit };

      const data = await plFetch(url, params);
      if (!data) return { content: [{ type: "text", text: "GED inaccessible." }] };

      const docs = data.documents ?? data.data ?? data ?? [];
      if (!docs.length) return { content: [{ type: "text", text: "Aucun document trouvé dans la GED." }] };

      const lines = docs.map((d, i) =>
        `${i + 1}. **${d.filename ?? d.name ?? "—"}** | Type: ${d.type ?? "—"} | Date: ${d.created_at?.slice(0, 10) ?? "—"} | ID: ${d.id}`
      );
      return {
        content: [{
          type: "text",
          text: `**GED — ${docs.length} document(s) :**\n\n` + lines.join("\n"),
        }],
      };
    }
  );

  return server;
}

// ─────────────────────────────────────────────
// 5. SERVEUR EXPRESS + SSE
// ─────────────────────────────────────────────

const app = express();
app.use(express.json());
const transports = new Map();

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);
  res.on("close", () => transports.delete(sessionId));
  await buildMcpServer().connect(transport);
  console.log(`Session ${sessionId} ouverte.`);
});

app.post("/messages", async (req, res) => {
  const transport = transports.get(req.query.sessionId);
  if (!transport) return res.status(404).json({ error: "Session introuvable." });
  await transport.handlePostMessage(req, res, req.body);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "pennylane-mcp", timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// 6. DÉMARRAGE
// ─────────────────────────────────────────────

if (!TOKEN) {
  console.error("⚠️  Variable manquante : PENNYLANE_FIRM_TOKEN");
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`✅ Serveur MCP Pennylane Cabinet démarré sur le port ${PORT}`);
  console.log(`   SSE   → http://localhost:${PORT}/sse`);
  console.log(`   Santé → http://localhost:${PORT}/health`);
  console.log(`   Outils : 15 (dossiers, balance, grand livre, factures, trésorerie, GED)`);
});
