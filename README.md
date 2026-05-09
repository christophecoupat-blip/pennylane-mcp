# pennylane-mcp — Serveur MCP pour Pennylane Cabinet (API Firm)

Serveur MCP exposant l'ensemble des données Pennylane cabinet à Claude.
**15 outils** couvrant dossiers clients, comptabilité, facturation, trésorerie et GED.
Développé pour **ADALTA** — Perpignan.

## Outils exposés

### Cabinet
| Outil | Description |
|-------|-------------|
| `liste_dossiers` | Tous les dossiers clients du cabinet |
| `detail_dossier` | Détail d'un dossier (adresse, plan, clôture…) |
| `exercices_fiscaux` | Exercices fiscaux d'un dossier |

### Comptabilité
| Outil | Description |
|-------|-------------|
| `balance_comptable` | Balance générale par compte et par exercice |
| `grand_livre` | Écritures comptables avec filtres compte/période |
| `plan_comptable` | Plan comptable complet d'un dossier |

### Facturation
| Outil | Description |
|-------|-------------|
| `factures_clients` | Liste des factures clients avec filtres |
| `detail_facture_client` | Détail complet lignes/TVA/paiements |
| `factures_fournisseurs` | Liste des factures fournisseurs |
| `detail_facture_fournisseur` | Détail complet d'une facture fournisseur |

### Tiers
| Outil | Description |
|-------|-------------|
| `liste_clients` | Tiers clients d'un dossier |
| `liste_fournisseurs` | Tiers fournisseurs d'un dossier |

### Trésorerie
| Outil | Description |
|-------|-------------|
| `transactions_bancaires` | Transactions avec filtres statut/période/compte |
| `comptes_bancaires` | IBAN, soldes, synchronisation bancaire |

### GED
| Outil | Description |
|-------|-------------|
| `documents_ged` | Documents GED du cabinet ou d'un dossier |

---

## Prérequis : générer le Firm Token

1. Connectez-vous à votre espace **cabinet** Pennylane
2. Allez dans **Paramètres cabinet → Firm Tokens**
3. Cliquer **Generate an API Token**
4. Nom : `claude-adalta` | Scopes : **Read (tous)** | Durée : Unlimited
5. Copiez le token immédiatement (affiché une seule fois)

---

## Variable d'environnement

| Clé | Valeur |
|-----|--------|
| `PENNYLANE_FIRM_TOKEN` | Votre Firm Token Pennylane |

---

## Déploiement Render

1. GitHub → repo `pennylane-mcp` → uploader les 3 fichiers
2. Render → New Web Service
   - Build : `npm install` / Start : `npm start` / Instance : Free
3. Variables : `PENNYLANE_FIRM_TOKEN`
4. Claude.ai → Connectors :
   - Name : `Pennylane Cabinet`
   - URL : `https://pennylane-mcp.onrender.com/sse`

---

## Exemples d'utilisation

```
Liste tous les dossiers du cabinet ADALTA dans Pennylane
```
```
Donne-moi la balance comptable du dossier CB Business (ID Pennylane à récupérer d'abord)
```
```
Quelles sont les factures fournisseurs non payées du dossier 12345 ?
```
```
Affiche les transactions bancaires non rapprochées de janvier 2025 pour le dossier 12345
```
