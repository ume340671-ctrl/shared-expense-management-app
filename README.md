# T9DYA MANAGER

Application web premium de gestion des **achats et dépenses quotidiennes partagés** entre quatre colocataires.

Chaque fois qu'une personne achète quelque chose pour le groupe, elle ouvre l'application, saisit le nom de l'article, son prix unitaire, la quantité et sélectionne la personne qui a payé. Toutes les données sont enregistrées dans **Supabase (PostgreSQL)** et restent accessibles aux quatre colocataires, en temps réel.

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend — React 19 + Vite + TypeScript + Tailwind CSS 4    │
│                                                              │
│  pages/          layouts implicites dans components/AppShell  │
│  components/     UI réutilisable (modale, boutons, cartes…)  │
│  hooks/          useAuth · usePurchases · useTheme · useToast│
│  services/       Accès aux données (Supabase) + auth         │
│  lib/            calculs purs, formatage DH, filtres, validation│
└───────────────────────────┬──────────────────────────────────┘
                            │  @supabase/supabase-js (HTTPS + Realtime)
┌───────────────────────────▼──────────────────────────────────┐
│  Supabase                                                    │
│   • PostgreSQL  — tables housemates & purchases               │
│   • Auth        — compte unique partagé                       │
│   • RLS         — sécurité au niveau base de données          │
│   • Realtime    — synchronisation entre colocataires          │
└──────────────────────────────────────────────────────────────┘
```

**Principe directeur :** la base Supabase est l'unique source de vérité. Aucune donnée métier n'est stockée dans le navigateur, aucune statistique n'est fictive — tout est calculé à partir des achats réellement enregistrés.

**Mode local de secours :** si les variables d'environnement Supabase sont absentes (par exemple à la prévisualisation), l'application bascule automatiquement sur une implémentation locale (`localStorage`) qui respecte la même interface. Cela permet de tester l'application sans backend ; en production, les données sont toujours dans Supabase.

### Stack technique

| Technologie        | Rôle                                        |
| ------------------ | ------------------------------------------- |
| React 19 + Vite 7  | Interface utilisateur                       |
| TypeScript         | Typage strict                               |
| Tailwind CSS 4     | Design system (tokens CSS, thèmes)          |
| Supabase           | PostgreSQL, Auth, RLS, Realtime             |
| Josefin Sans       | Typographie principale (Google Fonts)       |
| Vitest             | Tests unitaires (calculs, filtres, validation) |
| Netlify            | Hébergement (build `npm run build` → `dist`) |

---

## 2. Structure du projet

```
.
├── index.html                     # Police Josefin Sans, meta, titre
├── netlify.toml                   # Build + redirections SPA
├── .env.example                   # Modèle des variables publiques
├── supabase/
│   └── migrations/
│       ├── 20260101000000_initial_schema.sql   # Tables, contraintes, index, RLS, seed, realtime
│       ├── 20260401000000_purchase_photos.sql    # Colonne photo_path + bucket Storage + politiques
│       ├── 20260501000000_audit_logs.sql         # Table audit_logs + triggers + RLS lecture seule
│       └── 20260101000001_shared_account.sql   # Création optionnelle du compte partagé
├── src/
│   ├── main.tsx / App.tsx         # Point d'entrée, orchestration
│   ├── types/                     # Types du domaine
│   ├── lib/
│   │   ├── config.ts              # Variables d'environnement, compte partagé
│   │   ├── supabase.ts            # Client Supabase (singleton)
│   │   ├── format.ts              # Montants DH, dates, pourcentages
│   │   ├── stats.ts               # Totaux, stats par personne (fonctions pures)
│   │   ├── filters.ts             # Recherche, filtres, tri (fonction pure)
│   │   ├── validation.ts          # Validation du formulaire d'achat
│   │   ├── photoStorage.ts        # Photos : validation, upload, URL signées
│   │   ├── errors.ts               # Messages d'erreur contextualisés
│   │   └── auditFormat.ts          # Résumés et diffs d'audit
│   ├── services/
│   │   ├── dataService.ts         # Interface + sélection Supabase / local
│   │   ├── supabaseData.ts        # Implémentation Supabase (CRUD + Realtime)
│   │   ├── localData.ts           # Implémentation locale de secours
│   │   └── auth.ts                # Connexion compte partagé
│   ├── hooks/                     # useAuth, usePurchases, useTheme, useToast, usePhotoUrls
│   ├── components/                # AppShell, PurchaseFormModal, PhotoThumb, PhotoLightbox, Button, Modal…
│   └── pages/                     # LoginPage, DashboardPage, PurchasesPage, PeoplePage
└── src/**/__tests__/              # Tests Vitest, interface et PostgreSQL local
```

---

## 3. Installation et configuration (guide étape par étape)

### Étape 1 — Installer les dépendances

```bash
npm install
```

### Étape 2 — Créer le projet Supabase

1. Rendez-vous sur [supabase.com](https://supabase.com) et créez un projet.
2. Notez l'**URL du projet** et la **clé anon (publique)** :
   Dashboard → *Project Settings* → *API*.

### Étape 3 — Exécuter les migrations SQL

Dans le Dashboard Supabase : *SQL Editor* → *New query*.

1. Collez le contenu de `supabase/migrations/20260101000000_initial_schema.sql` puis **Run** `20260401000000_purchase_photos.sql` (photos) et `20260501000000_audit_logs.sql` (module Audit).
   Ce script :
   - crée les tables `housemates` et `purchases` (contraintes, index) ;
   - insère les **quatre colocataires** de façon idempotente ;
   - active la **Row Level Security** et les politiques limitées au compte partagé ;
   - active le **temps réel** sur `purchases`.
2. (Optionnel) Exécutez `supabase/migrations/20260101000001_shared_account.sql` en suivant les commentaires, ou utilisez la méthode du Dashboard (étape 5).

> Les migrations sont **idempotentes** : les rejouer ne crée aucun doublon.

### Étape 4 — Insérer les quatre colocataires

Ils sont déjà insérés par la migration. Vérification :

```sql
select full_name from public.housemates order by full_name;
-- RACHID FERHAOUI
-- ELHOUSSAINE OUMLAL
-- TARIK MERRAS
-- ABDESAMAD HAMI
```

### Étape 5 — Créer le compte partagé `admin-2026@gmail.com`

Dashboard → *Authentication* → *Users* → **Add user** :

- Email : `admin-2026@gmail.com`
- Password : un **mot de passe fort** (12 caractères minimum, lettres, chiffres, symboles).
- Cochez **Auto Confirm User**.

Puis, dans *Authentication* → *Sign In / Providers* :

- **Désactivez « Enable sign ups »** (aucune inscription publique).
- Conservez uniquement le fournisseur **Email**.

> Aucun mot de passe n'est stocké dans l'application. Transmettez-le aux colocataires par un canal sûr (et changez-le après la première connexion si nécessaire).

### Étape 6 — Définir / changer le mot de passe

Dashboard → *Authentication* → *Users* → ligne du compte → **…** → *Reset password*, ou utilisez le script SQL optionnel de la migration `…0001_shared_account.sql`.

### Étape 7 — Configurer les variables d'environnement

```bash
cp .env.example .env
```

Puis renseignez dans `.env` :

```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-anon-publique
```

⛔ **Ne mettez jamais la clé `service_role` dans un fichier `.env` ni dans une variable `VITE_*`** : tout ce qui est préfixé par `VITE_` est exposé publiquement. La clé `service_role` ne doit servir que sur un serveur que vous contrôlez.

### Étape 8 — Tester en local

```bash
npm run dev        # http://localhost:5173
npm run test       # Tests unitaires et d'integration
npm run typecheck  # vérification TypeScript
```

Connectez-vous avec `admin-2026@gmail.com` et le mot de passe défini à l'étape 5, puis ajoutez un achat (ex. : Eau, 6 DH, quantité 3, RACHID FERHAOUI → 18 DH). Il doit apparaître immédiatement dans l'historique et les statistiques.

### Étape 9 — Déployer sur Netlify

**Option A — interface Netlify**

1. [app.netlify.com](https://app.netlify.com) → *Add new site* → *Import an existing project*.
2. Build command : `npm run build` — Publish directory : `dist` (déjà dans `netlify.toml`).
3. *Site configuration* → *Environment variables* : ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
4. *Deploy*.

**Option B — ligne de commande**

```bash
npm run build
npx netlify deploy --prod
```

### Étape 10 — Vérifier la persistance

1. Connectez-vous sur le site déployé.
2. Ajoutez un achat, notez son montant.
3. Déconnectez-vous, reconnectez-vous : l'achat est toujours là.
4. Ouvrez l'application dans un autre navigateur (ou demandez à un colocataire) : les nouvelles données apparaissent **sans rechargement** (Supabase Realtime).

---

## 4. Règles de calcul

| Règle                | Détail                                                        |
| -------------------- | ------------------------------------------------------------- |
| Montant total        | `prix unitaire × quantité` (arrondi à 2 décimales)            |
| Prix unitaire        | Obligatoire, ≥ 0, virgule décimale acceptée                   |
| Quantité             | Champ retiré du formulaire ; `1` automatiquement pour les nouveaux achats |
| Nom d'article        | Obligatoire, non vide                                         |
| Acheteur             | Obligatoirement l'un des quatre colocataires                  |
| Date                 | Jour de l'achat par défaut, modifiable, ≤ aujourd'hui         |
| Affichage            | Deux décimales uniquement si nécessaires (`18 DH`, `18,5 DH`) |

Les montants sont stockés en `numeric(12,2)` dans PostgreSQL (pas de `float`) pour éviter les erreurs d'arrondi.

Les anciennes quantités ne sont pas réécrites ni supprimées. Lors de la modification d'un ancien achat avec plusieurs unités, le formulaire rappelle la quantité historique et conserve le calcul du total. Les nouveaux achats ne demandent que le prix, sans case de quantité.

---

## 5. Sécurité

- **Auth** : un seul compte (`admin-2026@gmail.com`), inscriptions publiques désactivées.
- **RLS activée** sur `housemates` et `purchases` : même si la clé anon est publique (elle l'est toujours), un visiteur non connecté ne peut **ni lire ni écrire** aucune ligne.
- Les politiques vérifient `auth.jwt() ->> 'email' = 'admin-2026@gmail.com'` directement **dans la base** — la sécurité ne dépend pas du code React.
- `housemates` : lecture seule pour le client (les noms sont insérés par migration).
- `purchases` : select / insert / update / delete pour le compte partagé.
- Contraintes SQL (prix ≥ 0, quantité ≥ 1, date ≤ aujourd'hui, article non vide, clé étrangère vers `housemates`).
- Aucun secret dans le frontend : `.env.example` ne contient que des valeurs publiques.

---

## 6. Synchronisation temps réel

`usePurchases` s'abonne aux changements `postgres_changes` de la table `purchases`. Quand un colocataire ajoute, modifie ou supprime un achat, les autres voient immédiatement se mettre à jour :

- la liste des achats,
- le total des dépenses,
- les dépenses du mois,
- les statistiques par personne,
- les derniers achats.

Les erreurs réseau sont affichées dans une bannière avec bouton « Réessayer ».

---

## 7. Design

- **Thème sombre par défaut** (noir profond `#08090B`, surfaces anthracite, texte blanc cassé) et **thème clair optionnel** (bouton dans l'en-tête / la barre latérale).
- **Vert citron** `#C8F65D` pour les actions principales et les montants importants.
- **Josefin Sans** partout, avec une hiérarchie typographique soignée (titres légers, libellés en petites capitales espacées).
- Coins arrondis, bordures fines, ombres légères, animations discrètes (`fade`, `rise`, `pop`, shimmer des squelettes).
- **Mobile first** : barre de navigation inférieure (Accueil / Achats / Dépenses), bouton d'ajout accessible d'une main, clavier numérique pour les prix, aucun débordement horizontal, zones tactiles ≥ 40 px.
- Accessibilité : contrastes, `aria-label`, focus visible, `prefers-reduced-motion` respecté.

---

## 8. Tests

```bash
npm run test
```

La suite de tests couvre les achats de la maison, les statistiques, la recherche, les filtres, les montants DH, les validations, les photos et l'Audit, ainsi que les dépenses entre amis, les remboursements, la clôture sécurisée des périodes, les archives et les permissions PostgreSQL. Les tests récents vérifient aussi l'absence du champ quantité, la conservation des anciens montants et la suppression sécurisée de l'historique. Deux parcours Chromium complémentaires vérifient l'interface sur ordinateur et mobile (voir section 12).

---

## 9. Scripts npm

| Commande             | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Serveur de développement                 |
| `npm run build`      | Build de production (`dist/`)            |
| `npm run preview`    | Prévisualisation du build                |
| `npm run test`       | Tests unitaires (Vitest)                 |
| `npm run typecheck`  | Vérification TypeScript                  |
| `npm run test:browser` | Parcours Chromium ordinateur et mobile |

---

## 10. Photos des achats (Supabase Storage)

Chaque achat peut recevoir une **photo réelle** (photo de l'article).

### Fonctionnement

| Étape | Détail |
| ----- | ------ |
| Sélection | Bouton « Ajouter une photo » (galerie / fichiers) ou appareil photo (mobile) |
| Validation | Type réel (JPG, JPEG, PNG, WEBP) et taille ≤ 5 Mo vérifiés **avant l'envoi** |
| Aperçu | Image affichée dans le formulaire, remplaçable ou supprimable avant validation |
| Stockage | Fichier envoyé dans le bucket privé `purchases/<id-achat>/<uuid>.ext` |
| Référence | Le chemin est enregistré dans la colonne `purchases.photo_path` |
| Affichage | Miniature cliquable dans l'historique et le tableau de bord → visionneuse plein écran |
| Suppression | Supprimer un achat supprime aussi sa photo ; remplacer/supprimer la photo seule est possible |

### Activer la fonctionnalité (migration)

Dashboard Supabase → *SQL Editor* → exécutez `supabase/migrations/20260401000000_purchase_photos.sql`.
Ce script :

- ajoute la colonne `photo_path` à `purchases` (**sans toucher aux données existantes**) ;
- crée le bucket privé `purchase-photos` (5 Mo max, JPG/PNG/WEBP) ;
- crée les politiques Storage : seul le compte partagé peut lire, déposer, mettre à jour et supprimer les photos.

Le bucket est **privé** : les images ne sont jamais publiques, l'affichage passe par des URL signées valables 6 h, régénérées automatiquement.

### Fichiers concernés

```
src/lib/photoStorage.ts          # validation + upload/suppression/URL signées (IndexedDB en secours)
src/hooks/usePhotoUrls.ts        # résolution des chemins en URL affichables
src/components/PhotoThumb.tsx    # miniature cliquable
src/components/PhotoLightbox.tsx # visionneuse
src/components/PurchaseFormModal.tsx  # champ photo (galerie + caméra + aperçu)
src/services/*Data.ts            # colonne photo_path + setPurchasePhoto()
```

---

## 11. Module Audit (journal des opérations)

La rubrique **Audit** (barre latérale, après « Dépenses ») affiche le journal horodaté de toutes les opérations.

### Ce qui est journalisé automatiquement

| Opération | Type | Source |
| --------- | ---- | ------ |
| Ajout d'un achat | `CREATE` | trigger `purchases_audit_insert` |
| Modification (nom, prix, quantité, date, acheteur, remarque, photo) | `UPDATE` | trigger `purchases_audit_update` |
| Suppression d'un achat | `DELETE` | trigger `purchases_audit_delete` |
| Dépôt d'une photo | `UPLOAD` | trigger `purchase_photos_audit` (storage.objects) |
| Suppression d'une photo | `DELETE` | trigger `purchase_photos_audit` (storage.objects) |

### Pourquoi des triggers PostgreSQL

- **Non falsifiable** : l'auteur (`actor_id`, `actor_email`) est lu dans le JWT de la session par le serveur — le frontend ne peut pas inventer l'auteur d'une opération.
- **Lecture seule en accès direct** : la table `audit_logs` n'accorde aucun droit d'écriture au rôle `authenticated` (les triggers s'exécutent en `SECURITY DEFINER`). Une suppression administrative explicite peut désormais être demandée via la RPC sécurisée décrite ci-dessous ; aucun accès direct `DELETE`, `UPDATE` ou `TRUNCATE` n'est accordé.
- **Cohérent** : un événement n'est créé que si l'opération a réellement eu lieu (le trigger fait partie de la transaction). Aucun doublon : une modification sans changement métier n'est pas journalisée.
- **Aucune donnée sensible** : seules les valeurs métier des achats sont enregistrées (jamais de mot de passe, jeton ou clé).

> Note : les opérations Storage passent par l'API Storage. Si le JWT n'est pas propagé dans ce contexte, l'événement photo est enregistré sans auteur explicite (« un utilisateur ») — l'événement de modification de l'achat, déclenché via l'API REST avec le JWT de l'utilisateur, porte toujours l'identité réelle de l'auteur.

### Page Audit

- Tableau (ordinateur) / cartes (mobile) : date et heure, utilisateur, action, élément, détails.
- Recherche (utilisateur ou élément), filtres par type d'action, par utilisateur et par mois.
- Clic sur un événement → détail complet avec **anciennes valeurs → nouvelles valeurs**.
- Pagination (12 événements par page), état vide dédié, mise à jour automatique dès qu'un événement est enregistré (Supabase Realtime).

### Activer le module (migration)

SQL Editor → exécutez `supabase/migrations/20260501000000_audit_logs.sql` (après les migrations précédentes).
Le script crée la table `audit_logs`, ses index, la politique RLS en lecture seule, et les 4 triggers.

### Fichiers concernés

```
supabase/migrations/20260501000000_audit_logs.sql  # table + triggers + RLS
src/pages/AuditPage.tsx                            # page Audit (filtres, pagination)
src/components/AuditDetailModal.tsx                # badge d'action + détail vie/neuve valeurs
src/lib/auditFormat.ts                             # résumés et diffs (mode local)
src/hooks/useAuditLogs.ts                          # chargement paginé + temps réel
src/services/*Data.ts                              # listAuditLogs / listAuditActors + journalisation locale
```

### Supprimer L'Historique D'Audit

Le bouton **Supprimer l'historique** est disponible dans la page Audit pour le compte partagé autorisé. Il prépare une liste exacte des événements à supprimer, affiche le nombre réel et exige la saisie de **SUPPRIMER**. La suppression concerne tout le journal préparé, y compris les événements masqués par les filtres. Les événements ajoutés pendant la confirmation ne sont pas supprimés, même s'ils ont le même horodatage.

Cette opération est définitive mais ne supprime aucun achat, photo, participant, remboursement ou période entre amis. Les triggers restent actifs et les nouvelles opérations continuent d'apparaître dans le journal. Aucun historique distant n'est effacé simplement en installant le code ou la migration.

Pour activer cette possibilité, exécutez **`supabase/migrations/20260701000000_audit_history_cleanup.sql`** dans le SQL Editor de Supabase, après la migration Audit. Aucun nouveau secret ni changement de mot de passe n'est nécessaire. La suppression elle-même n'est déclenchée que par une confirmation utilisateur ultérieure.

- `preview_audit_history_clear()` crée une préparation privée contenant les identifiants exacts des événements et une échéance de 30 minutes.
- `clear_audit_history(uuid, timestamptz, text)` vérifie l'identité Supabase, la confirmation, la préparation et son échéance, puis supprime uniquement les événements approuvés dans une transaction.
- Le compte partagé conserve un accès direct en lecture seule. Les visiteurs anonymes et les autres comptes ne peuvent ni préparer ni exécuter cette suppression.
- Une trace administrative minimale est conservée séparément dans `audit_history_purges` : auteur issu du JWT, date, nombre d'événements. Elle ne contient pas les anciens détails et ne peut pas être modifiée ni supprimée depuis le frontend.
- Les identifiants de demande rendent un réenvoi réseau idempotent : la même confirmation ne supprime pas une seconde fois des événements ultérieurs.
- Les préparations annulées ou expirées sont nettoyées lors des préparations suivantes. Les autres appareils sont prévenus d'une suppression via Supabase Realtime.

Les composants concernés sont `src/components/AuditClearDialog.tsx`, `src/pages/AuditPage.tsx`, `src/hooks/useAuditLogs.ts`, `src/services/*Data.ts` et `src/lib/auditClear.ts`.

---

## 12. Dépenses Entre Amis

La nouvelle rubrique **Dépenses entre amis** (ou **Amis** dans la navigation mobile) est indépendante de la maison. Le compte partagé, le thème, les couleurs et la police existants sont conservés. Aucun participant n'est créé automatiquement et aucune dépense de démonstration n'est ajoutée.

### Utilisation

1. Ouvrez **Dépenses entre amis** et cliquez sur **Ajouter un ami**. Ajoutez votre nom puis ceux des autres personnes ; aucun compte supplémentaire n'est nécessaire.
2. Choisissez **Nouvelle dépense** : description, montant total en DH, payeur, participants, date et remarque facultative.
3. Les participants sélectionnés partagent le montant à parts égales. Pour une dépense personnelle, sélectionnez uniquement le payeur. Une personne peut aussi payer pour d'autres personnes sans être bénéficiaire.
4. Consultez **Soldes & remboursements**. Un solde positif est à recevoir ; un solde négatif est à rembourser. Les propositions compensent les soldes nets, mais ne constituent jamais un paiement automatique.
5. Après un paiement réel, cliquez sur **Noter le remboursement** ou **Enregistrer un remboursement**. Les remboursements partiels sont possibles ; les dépassements de solde sont refusés côté serveur. L'application ne transfère pas d'argent.
6. Vous pouvez modifier ou supprimer une dépense de la période courante. Une confirmation est obligatoire pour la suppression ou l'annulation d'un remboursement mal saisi. Les soldes sont recalculés immédiatement.

### Réinitialisation Sans Perte D'Historique

Le bouton **Réinitialiser les dépenses** ne supprime aucune période : il clôture la période active et en ouvre une nouvelle, avec des dépenses et des soldes à zéro.

- S'il reste un solde non nul, un avertissement détaille les remboursements en attente et la confirmation est désactivée. Le serveur refuse également la clôture, même si quelqu'un tente de contourner l'interface.
- Si tous les soldes sont à zéro, une confirmation explicite est demandée. Les dépenses et remboursements précédents restent consultables dans **Historique**, en lecture seule.
- Une période déjà vide n'a pas besoin d'être réinitialisée.
- Les participants sont conservés entre les périodes. Les achats de la maison, les colocataires et les photos ne sont jamais réinitialisés.

### Architecture Et Sécurité

| Élément | Rôle |
| --- | --- |
| `friend_members` | Participants libres, distincts de `housemates` |
| `friend_periods` | Une seule période active, anciennes périodes conservées |
| `friend_expenses` | Dépenses, payeur et liste des bénéficiaires |
| `friend_settlements` | Remboursements réellement effectués, liés à une période |
| `friends_snapshot(uuid)` | Lecture cohérente des données et des soldes calculés par PostgreSQL |
| `friends_mutate(uuid, text, jsonb)` | Écritures transactionnelles, validation et clôture sécurisée |

Les montants sont stockés en **centimes entiers** (`bigint`) et non en flottants. Les centimes indivisibles sont attribués dans l'ordre des identifiants des participants, de manière déterministe : aucune somme n'est perdue lors d'une division. Les remboursements réduisent les soldes ; ils ne gonflent pas le total des dépenses.

La RLS limite la lecture au compte partagé authentifié. Les écritures directes sont révoquées pour `anon` et `authenticated` : elles passent uniquement par les RPC, dont le `search_path` est fixé et l'identité contrôlée côté serveur. Les fonctions internes sont placées dans un schéma privé non exposé. **Ne pas ajouter `t9dya_private` aux schémas exposés de l'API Supabase.**

Toutes les mutations prennent le même verrou de ligne sur la période. Une dépense ou un remboursement concurrent ne peut donc pas passer entre la vérification des soldes et la clôture. Les formulaires gardent l'identifiant de la période ouverte : une saisie commencée avant une clôture ne peut pas être enregistrée par erreur dans la nouvelle période.

Les identifiants stables rendent les tentatives de réenvoi après perte réseau idempotentes. Les modifications de dépenses utilisent aussi `expected_updated_at` pour refuser l'écrasement de données modifiées sur un autre appareil. Les opérations sont journalisées dans l'**Audit** existant avec l'identité serveur, au sein de la même transaction. Les tables amis sont ajoutées à `supabase_realtime` lorsqu'elle existe.

Ce module utilise uniquement Supabase pour les données métier. Contrairement au mode de secours historique de la maison, il ne bascule pas vers un stockage local ou une simulation si la configuration manque : il affiche une explication et un bouton de nouvelle tentative.

### Activation Sur Le Projet Existant

1. Conservez les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` déjà configurées. Aucun nouveau secret n'est nécessaire.
2. Vérifiez que les migrations initiale, photos et Audit ont déjà été appliquées. Ne supprimez et ne réinitialisez aucune table existante.
3. Dans **Supabase > SQL Editor**, exécutez entièrement `supabase/migrations/20260601000000_friends_expenses.sql`. Elle crée les quatre tables isolées, les RPC, les politiques RLS, les triggers d'audit et une première période vide. Elle peut être rejouée sans effacer les données.
4. Rechargez l'application et utilisez le compte partagé habituel. Ajoutez vos propres participants et dépenses.
5. Sur Netlify, redéployez avec `npm run build` et le dossier `dist`, sans changer les variables existantes.
6. Vérifiez sur deux appareils connectés que les données se synchronisent. Vérifiez aussi qu'un accès anonyme ne permet pas de lire les tables ou d'exécuter les RPC.

La clé publique fournie ne donne **pas** le droit d'appliquer une migration SQL. Le code et les tests locaux ne signifient pas que cette migration a été exécutée sur le projet Supabase distant. Aucune clé `service_role` ne doit être ajoutée au frontend.

### Fichiers Principaux

- `src/pages/FriendsPage.tsx` : rubrique, recherche, pagination, soldes et historique.
- `src/components/friends/` : formulaires, registre et confirmation de clôture.
- `src/hooks/useFriends.ts` et `src/services/friendsService.ts` : chargement, RPC, erreurs et synchronisation.
- `src/types/friends.ts` et `src/lib/friends.ts` : types, calculs exacts, propositions et validation.
- `src/App.tsx` et `src/components/AppShell.tsx` : intégration sans remplacer les rubriques existantes.
- `src/lib/auditFormat.ts` : libellés lisibles des nouveaux champs dans l'Audit.

### Vérifications Automatisées

```bash
npm run typecheck
npm run test
npm run build

# Tests facultatifs dans un vrai navigateur (ordinateur et mobile)
npx playwright install --with-deps chromium
npm run test:browser
```

Les tests PostgreSQL utilisent PGlite, un moteur PostgreSQL local en WebAssembly. Les migrations et RPC réelles y sont exécutées, avec les schémas Auth et Storage de Supabase reproduits pour les tests uniquement. Les tests de l'interface et les parcours Chromium utilisent ces mêmes RPC locales ; ils n'envoient aucune donnée de test au projet Supabase distant.

Ils couvrent notamment les centimes, les dépenses personnelles, les parts inégales après arrondi, les remboursements partiels, les surpaiements refusés, les clôtures bloquées, les archives, les réessais réseau, les modifications concurrentes, les accès interdits et l'absence d'impact sur un achat de la maison. Les captures éventuelles sont dans `artifacts/`, jamais dans les médias de production.

---

## 13. Dépannage

| Problème                                              | Solution                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| « Adresse e-mail ou mot de passe incorrect »          | Vérifiez le compte dans *Authentication → Users* (email confirmé).        |
| Bannière rouge « Impossible de charger les achats »   | Migrations non exécutées, ou mauvaises variables d'environnement.         |
| Les données ne se synchronisent pas entre appareils   | Vérifiez que la table `purchases` est dans la publication `supabase_realtime`. |
| Erreur 401 / liste vide après connexion               | L'email du compte diffère de `admin-2026@gmail.com` : adaptez les politiques RLS. |
| Rien ne s'affiche (page blanche)                      | Vérifiez les variables `VITE_*` dans Netlify puis redéployez.             |

---

T9DYA MANAGER — simplicité, rapidité, données réelles.
