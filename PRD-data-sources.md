# PRD : Configuration no-code des sources de données

## Vue d'ensemble

Configurer un graphique, un KPI ou un top N depuis le builder visuel sans écrire de route ni
saisir d'URL d'API. Le bloc déclare la forme de données qu'il consomme ; un éditeur commun
(« widget `dataSource` ») recueille l'intention de l'utilisateur — source, mesure,
regroupement, filtres, période — et le moteur `cms-builder` génère la méthode de modèle, la
route et son garde, puis les sauvegarde dans la même transaction que les blocs de la page.

Ce document prolonge `PRD.md` (visual builder), dont les lots A/B/C sont livrés sur `main`.

**Mise à jour du 17/09/2026** — le dépôt a été restructuré entre-temps : monorepo public
`@antelopejs/dms-builder` + `@antelopejs/interface-dms-builder`, moteur sous
`packages/dms-builder/src/implementations/dms-builder/`, et **front migré vers Inertia**
(`frontend-vue`, le layer Nuxt n'existe plus). Le vocabulaire a suivi : `@antelopejs-private/cms`
devient `@antelopejs/interface-dms`. Les lots A et B sont inchangés ; le lot C est à relire à la
lumière d'Inertia.

## Problème

Le builder génère les panneaux de configuration à partir des schémas de blocs. Pour les
options simples cela suffit ; pour les blocs de données, cela expose la plomberie :
aujourd'hui le widget `query` de `ChartCard.fetchUrl` est un select des requêtes existantes
**plus un champ libre « or an endpoint, e.g. /api/stats/revenue »**, et le panneau des
requêtes ne sait produire que `count` et `aggregate`, dont la sortie est un scalaire.

Aucun template ne sait donc produire ce qu'un graphique consomme. Configurer un graphique
oblige à écrire soi-même une route, à connaître la forme de réponse attendue, puis à recopier
l'URL dans le bloc.

Trois manques structurels :

1. **Formes de sortie** — le moteur ne produit que `{ value }`. Les blocs attendent quatre
   formes distinctes (voir Contraintes).
2. **Cycle de vie** — les requêtes sont écrites sur disque immédiatement, alors que l'arbre de
   blocs vit dans un brouillon : « Annuler » laisse des routes orphelines, et undo/redo ne
   rembobine pas le backend.
3. **Extension** — rien ne permet à un développeur d'exposer une source métier déjà écrite,
   ni à un bloc tiers de déclarer ses besoins en données.

## Objectifs et critères de succès

**Critère de réussite du parcours de référence** : un utilisateur configure un graphique,
prévisualise ses données réelles, le sauvegarde et le rouvre sans écrire de code ni manipuler
une URL d'API.

Mesures :

- Le champ « endpoint » libre n'est plus le chemin nominal : il est replié sous « Avancé ».
- L'aperçu affiche les **vraies** données avant toute écriture disque.
- Sauvegarde = une transaction : blocs, méthodes de modèle et routes, un seul typecheck.
- Après « Annuler », aucune route ni méthode de modèle n'a été créée.
- Une source générée se relit : rouvrir la page réaffiche l'éditeur rempli, pas un champ opaque.
- Toute route de données générée porte un garde d'autorisation.

## User stories

- En tant qu'utilisateur, je choisis une ressource, une mesure et un regroupement, et j'obtiens
  un graphique alimenté, sans savoir qu'une route a été écrite.
- En tant qu'utilisateur, je filtre les lignes prises en compte (statut = payée) avec les mêmes
  contrôles que dans une table.
- En tant qu'utilisateur, je lie mon graphique au sélecteur de période de la page et je vois la
  variation par rapport à la période précédente.
- En tant qu'utilisateur, je vois mes données dans le canvas avant de sauvegarder.
- En tant qu'utilisateur, je supprime un bloc et sa source disparaît avec lui — sauf si un autre
  bloc l'utilise, auquel cas on me le dit.
- En tant que développeur, j'expose une route métier que j'ai écrite à la main, et elle apparaît
  dans la liste des sources avec ses paramètres.
- En tant que développeur, je reprends la main sur une route générée ; le builder ne l'écrase
  plus et me le signale.

## Modèle conceptuel

Une **source de données** est une requête de page, adressée comme aujourd'hui par
`<pageRef>@<name>`. Elle se décompose en deux moitiés indépendantes :

| Moitié | Contenu | Qui la choisit |
| --- | --- | --- |
| **Calcul** (`plan`) | mesure, regroupement, filtres, période, tri, limite | L'utilisateur, via l'éditeur |
| **Enveloppe** (`response`) | la forme JSON que la route renvoie | Le bloc, via son schéma |

Cette séparation est la correction centrale par rapport au modèle `template → output` actuel :
un même calcul alimente un `Chart` nu (`{ series }`) ou un `ChartCard`
(`{ value, series, delta }`) sans être re-décrit.

## Exigences fonctionnelles

### Lot A — `cms` : ce qu'un bloc déclare

- `BlockOptionWidget` += `"dataSource"`.
- `BlockOptionUi` += `responseShape?: "kpi" | "chartCard" | "chart" | "topList"` et
  `periodOption?: string` (nom de l'option `periodScope` du même bloc, que l'éditeur écrit
  conjointement quand l'utilisateur lie la source à une période).
- `ChartCard.fetchUrl`, `KpiCard.fetchUrl`, `TopListCard.fetchUrl` et `Chart*.fetchUrl` passent
  de `widget: "query"` à `widget: "dataSource"` avec leur `responseShape`.
- `RegisterDataSource({ id, title, description, responseShape, params, path, method })` et
  `ListDataSources()`, à côté de `RegisterBlockType`/`ListBlockTypes` et lus par le builder par
  le même `require`. C'est le contrat d'extension pour les sources qu'un développeur écrit
  lui-même : le builder les liste et demande leurs paramètres, sans jamais lire ni réécrire leur
  code.

Aucun nouveau bloc, aucun changement de rendu.

### Lot B — moteur : le plan, ses trois consommateurs

Le cœur du lot. Les paramètres d'une source se compilent d'abord en une **représentation
intermédiaire** (`QueryPlan`), elle-même consommée par trois backends :

| Backend | Rôle |
| --- | --- |
| `emit(plan)` | Le texte TypeScript de la méthode de modèle (existant, généralisé) |
| `execute(plan, table)` | La même chaîne construite via l'API `Stream` et exécutée, pour l'aperçu |
| `parse(method)` | La lecture inverse, du code vers le plan |

Une IR unique est ce qui empêche l'aperçu et le code généré de diverger : sans elle, deux
implémentations de la même sémantique dérivent au premier correctif.

**Templates de calcul** : `count` et `aggregate` (existants, reportés sur l'IR sans changer
leur émission) et `series` (nouveau) — une mesure (`count`/`sum`/`avg`/`min`/`max`) par
regroupement, le regroupement étant soit un champ de la ressource, soit un **bucket temporel**
(jour, semaine, mois, trimestre, année) sur un champ date, avec tri et limite (ce qui couvre le
top N). Le fuseau horaire du bucket est explicite : les extracteurs de date de la couche base
acceptent un fuseau, et l'omettre produit des mois décalés.

**Enveloppes de réponse** : `kpi`, `chart`, `chartCard`, `topList`. Chacune sait quelles chaînes
exécuter et comment composer la réponse. `chartCard` en exécute deux (le total de la période et
la série), parce que recalculer le total depuis la série est faux pour `avg`, `min` et `max`.

**Comparaison** : quand la source est liée à une période, l'enveloppe rejoue ses chaînes sur
`compareFrom`/`compareTo` et renseigne `delta`, `previousValue` et `comparisonSeries`.
`showDelta` valant `true` par défaut sur `ChartCard`, s'en passer laisserait un emplacement de
variation vide sur tout graphique configuré sans code.

**Période** : deux filtres `ge`/`le` sur un champ date, dont la valeur est liée aux paramètres
de route `from` et `to` — le mécanisme `$param` existant, sans rien de neuf. Le front envoie
déjà ces paramètres en ISO et la route générée les convertit en `Date`.

**Brouillon et sauvegarde** :

- `PageDraft` += `queries: QueryDraft[]`.
- `SavePage(page, draft, opts)` écrit blocs, méthodes de modèle et routes dans **une**
  transaction : un typecheck, une écriture, un rollback commun.
- Les requêtes générées devenues non référencées par aucun bloc de la page sont supprimées dans
  la même passe ; une requête encore référencée ailleurs est conservée et signalée.
- Une requête devenue opaque (reprise à la main) n'est ni réécrite ni supprimée.
- `RunDraftQuery(page, draft, name, params)` exécute le plan d'une requête du brouillon en
  lecture seule et renvoie la réponse enveloppée, sans écrire de fichier. Plafonné en lignes et
  en durée, réservé au développement, gardé comme les autres routes du builder.
- L'accès aux données passe par le handle de schéma déjà utilisé par le moteur, dont l'instance
  porte le tenant : l'aperçu lit les données du tenant courant, jamais celles d'un autre.

**Garde** : toute route générée porte `@AuthUserWithPermission(<classe de la page>)` en
décorateur de paramètre — la permission de la page, et uniquement sur la route générée, sans
effet de bord sur le reste du contrôleur.

### Lot C — HTTP et layer Nuxt

- `POST /api/builder/preview-query`, et `POST /api/builder/save` étendu au brouillon complet.
- `GET /api/builder/data-sources` (sources déclarées + templates disponibles, filtrés par forme).
- L'éditeur de source : Source, Mesure, Regroupement, Filtres, Période, Comparaison, aperçu de
  l'URL résultante, et repli « Avancé » pour une URL saisie à la main. **À re-spécifier** : la
  description ci-dessous visait le layer Nuxt, remplacé par Inertia (`frontend-vue`).
- `Option.vue` gagne un émetteur de patch multi-clés : lier une période écrit `fetchUrl` **et**
  `periodScope` en un seul patch de configuration.
- En aperçu, le moteur réécrit les `fetchUrl` qui désignent une requête du brouillon vers
  l'URL d'exécution du brouillon ; à l'émission, la valeur écrite est l'URL réelle. Aucun
  nouveau sentinel de valeur n'est nécessaire : l'endpoint est calculable avant écriture.
- La vue « Requêtes » du rail devient « Sources » : liste, blocs consommateurs, suppression,
  avertissement de partage.

## Exigences non fonctionnelles

- **Aperçu** : réponse de `RunDraftQuery` < 300 ms sur un jeu de développement ; plafond de
  lignes lues et délai maximal, l'aperçu dégradant vers le dernier résultat valide.
- **Dev uniquement** : aucune route de builder en production ; le code généré, lui, est du code
  ordinaire qui vit en production.
- **Atomicité** : tout-ou-rien sur la sauvegarde, `expectedVersion` obligatoire, `stale` géré.
- **Fidélité** : l'aperçu passe par les mêmes composants et la même enveloppe de réponse que la
  route générée.
- **Lisibilité du code généré** : une méthode de modèle reste lisible et modifiable à la main ;
  sa reprise par un humain est détectée, pas écrasée.

## Contraintes techniques

Les quatre formes de réponse attendues par les blocs, telles qu'elles sont typées côté front :

| Bloc | Réponse |
| --- | --- |
| `KpiCard` | `{ value, delta?, previousValue?, sparkline? }` |
| `ChartCard` | `{ value, delta?, previousValue?, series, comparisonSeries? }` |
| `Chart*` | `{ series }` |
| `TopListCard` | `{ items: { id, title, description?, value, delta?, … }[] }` |

Autres contraintes relevées :

- Le regroupement sur une expression (bucket temporel) impose de projeter le bucket avant de
  grouper. **Vérifié sur les deux adapters** : côté PostgreSQL la projection est enveloppée en
  sous-requête et le `GROUP BY` porte sur l'expression ; côté MongoDB le même enchaînement rend
  les bons totaux par mois, filtre appliqué avant regroupement, `orderBy` et `slice` compris.
  Conséquence de performance : ce regroupement n'utilise pas d'index — d'où le plafond de lignes
  et un avertissement quand la ressource est volumineuse.
- **L'ordre des groupes n'est pas garanti** : MongoDB rend les buckets dans le désordre. Le
  template émet donc toujours un tri sur le regroupement, sans quoi un graphique reçoit ses
  points dans un ordre arbitraire.
- **Le fuseau est explicite ou faux** : PostgreSQL extrait l'année et le mois en UTC par défaut.
  Les extracteurs de date acceptent un fuseau ; l'omettre décale les buckets d'un mois pour
  toute donnée proche d'une fin de mois.
- **Une méthode de modèle est partagée par nom, pas par chaîne** : les noms candidats dérivent du
  nom de la requête (`revenue`, `revenue2`, …), donc deux requêtes de noms différents ne
  partagent jamais une méthode, même à calcul identique. `docs/interfaces/cms-builder/6.queries.md`
  laisse entendre l'inverse et est à corriger. Le plan ne doit pas élargir ce partage : une
  requête qui se mettrait à appeler la méthode d'une autre changerait ce que cette autre renvoie
  à sa prochaine édition.
- La grammaire de relecture actuelle ne reconnaît qu'une chaîne `this.table.filter(…)*` terminée
  par un agrégat, dans un `return` unique. La relecture d'un `map`/`group`/`orderBy`/`slice` et
  d'une enveloppe à plusieurs `await` est l'élément le plus coûteux du chantier, et la règle
  « exactement un template doit reconnaître la méthode » devra être resserrée.
- `cms-ai` consomme la même interface : tout changement de `PageDraft` ou de la sauvegarde
  impacte son sidecar MCP.
- Un renommage CMS → DMS est en cours sur `cms` et `cms-builder` : l'ordre de passage doit être
  calé avec son auteur avant d'ouvrir des PR sur ces fichiers.

## Hors périmètre

- Éditeur Vue propre à un bloc (`BlockTypeDefinition.editor`) : le widget commun couvre les
  familles de blocs actuelles. L'emplacement est nommé ici, il n'est pas construit.
- Jointures et relations : une source lit une seule ressource.
- Génération de logique arbitraire : les calculs restent des templates ; le reste passe par une
  source déclarée par un développeur.
- Sources partagées entre pages : une source vit sur sa page. Deux pages qui veulent le même
  graphique dupliquent la requête.
- Sources non SQL/NoSQL (API externes) autrement que par `RegisterDataSource`.
- Édition depuis le builder d'une route reprise à la main.

## Découpage en tâches

| # | Tâche | Dépend de | Estimation | État |
| --- | --- | --- | --- | --- |
| T0 | Harnais de test du moteur et correctif du registre de templates | — | 1 j | **fait** |
| T1 | Spike : regroupement sur champ projeté côté MongoDB | — | 0,5 j | **fait** |
| T2 | `dms` : widget `dataSource`, `responseShape`, repointage des quatre blocs | — | 0,5 j | **fait** (PR `dms`) |
| T3 | `dms` : `RegisterDataSource` + lecture côté builder | — | 0,5 j | **fait** (2 PR) |
| T4 | Moteur : IR `QueryPlan`, report de `count`/`aggregate` (émission inchangée) | — | 1,5 j | **fait** |
| T5 | Moteur : template `series` (bucket temporel et catégoriel, tri, limite, fuseau) | T1, T4 | 1,5 j | **fait** |
| T6 | Moteur : enveloppes de réponse (4 formes) et comparaison de période | T5 | 1,5 j | à faire |
| T7 | Moteur : relecture des nouvelles chaînes et des enveloppes | T6 | 2 j | **fait** |
| T8 | Moteur : `PageDraft.queries`, `SavePage` transactionnel, nettoyage des orphelines | T4 | 1,5 j | **fait** |
| T9 | Moteur : backend `execute` et `PreviewQuery` | T5, T8 | 1,5 j | **fait** |
| T10 | Garde d'autorisation sur les routes générées | T4 | 0,5 j | **fait** |
| T11 | HTTP : `preview-query`, `save` étendu, `data-sources` | T8, T9 | 0,5 j | **fait** |
| T12 | Front : éditeur de source, patch multi-clés, aperçu des données | T2, T11 | 2 j | **écrit, non vérifié** |
| T13 | Front : vue « Sources » — consommateurs, suppression, partage | T12 | 0,5 j | à faire |
| T14 | Documentation d'interface et parcours de référence | T7, T12 | 1 j | à faire |

Chemin critique restant : T6, puis T8 et T9. T2 et T3 vivent dans `cms` et sont parallélisables d'emblée.

### Ce que l'implémentation a établi

- **Le regroupement temporel fonctionne sur les deux adapters.** C'était le risque qui pouvait
  invalider le template `series` ; il est levé, avec les réserves de fuseau et de tri notées en
  contraintes.
- **Le registre de templates était vide sur `main`** depuis le découpage du moteur (#15, 7
  septembre) : le fichier portant `count` et `aggregate` n'était plus importé par personne.
  `AddQuery` et `ConfigureQuery` échouaient sur `unknown query template`, `ListQueryTemplates`
  répondait une liste vide, et **toute requête déjà écrite se relisait comme opaque**. Corrigé.
  La 0.0.4 publiée est antérieure au découpage et n'est pas touchée.
- **Le dépôt n'avait aucun test**, ce qui explique que la régression ait tenu neuf jours. Trente
  specs couvrent désormais le catalogue, le brouillon de page, les ressources et les requêtes,
  et tournent en dix secondes sans runtime Antelope.
- **Deux interfaces manquaient au manifeste** (`interface-data-api`,
  `interface-database-decorators`) : le paquet ne pouvait pas typechecker le code qu'il génère.
- **L'identité d'une chaîne ignorait la plupart de ses paramètres.** La clé qui décide si deux
  requêtes calculent la même chose énumérait `template`, `op`, `field` et `where` ; une série et
  la même série regroupée par trimestre avaient donc la même clé, et reconfigurer l'une
  réutilisait la méthode de l'autre **sans rien changer, silencieusement**. La clé couvre
  désormais tous les paramètres, quel que soit le template.
- **Les routes générées n'avaient aucune garde.** Elles portent maintenant la permission de la
  page, en décorateur de paramètre sur la seule route générée (décision D5).
- **Pas de semaine dans les buckets** : aucun adapter n'expose la semaine ISO, et la dériver du
  jour de l'année place début janvier dans la semaine de l'année précédente.

Jalon intermédiaire livrable : T1‑T6 + T8‑T12 donne le parcours de référence complet ; T7 (la
relecture) est ce qui le rend *réouvrable*, et ne peut pas être reporté au-delà de la première
version publiée sans piéger les utilisateurs.

## Questions ouvertes

- Nom du bucket temporel dans l'URL générée et dans le nom de la requête (`revenueByMonth` vs
  `revenue`) : lisibilité contre stabilité quand l'utilisateur change de granularité.
- Faut-il exposer publiquement le registre de templates de calcul, une fois l'IR stabilisée, ou
  laisser `RegisterDataSource` comme seule voie d'extension ?
- Comportement quand une ressource est renommée ou qu'un champ disparaît sous une source
  existante : refus au chargement, ou source marquée invalide dans l'éditeur ?
- Le plafond de lignes de l'aperçu doit-il être signalé à l'utilisateur (« aperçu sur les N
  premières lignes ») ou rester silencieux tant que le résultat est exact ?
