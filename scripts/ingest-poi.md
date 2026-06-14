# Ingestion des POI ouverts (Lot R2)

Ce document décrit le **pipeline d'ingestion** qui produit `src/data/poi.json`,
le jeu de POI quasi-statique embarqué et interrogé hors-ligne par
`src/lib/poi/poi.ts`.

> **Principe** (cf. `CLAUDE.md` §1) : la donnée *quasi-statique* (existence d'un
> lieu, coordonnées, adresse, **horaires**) ne change pas selon l'instant de la
> requête. On l'ingère **une fois** depuis des jeux ouverts maintenus, on la
> normalise, et on la sert **localement** : zéro appel réseau à l'usage, zéro
> quota, fonctionne hors-ligne. Rafraîchissement mensuel suffisant.

## Sources

- **Overture Maps** — thème `places` (GeoParquet, releases mensuelles sur
  S3/Azure ; aussi sur BigQuery). Champs : nom, catégorie, coordonnées, adresse,
  téléphone, horaires. Identifiant stable **GERS**.
- **Foursquare OS Places** (Apache 2.0) — GeoParquet / PMTiles via Places Portal
  (compte gratuit + token Iceberg) ou miroirs. 100M+ POIs, 1000+ catégories,
  horaires + contact.

Les tokens éventuels sont **build-time uniquement** (extraction du seed), jamais
des secrets runtime exposés au client.

## Procédé (par ville d'étape, générique)

1. **Bounding box** de chaque arrêt de l'itinéraire (Dijon, Lyon, Marseille,
   Beaune, Mâcon, Tain-l'Hermitage, Montélimar, Sens…).
2. Extraction des POI de la bbox avec **DuckDB (extension spatiale)** lisant
   directement le GeoParquet distant — on ne transfère que la zone :

   ```sql
   INSTALL spatial; LOAD spatial;
   INSTALL httpfs;  LOAD httpfs;

   -- Overture places dans la bbox (xmin, ymin, xmax, ymax)
   COPY (
     SELECT
       id,                              -- GERS, identifiant stable
       names.primary           AS name,
       categories.primary      AS source_category,
       ST_Y(ST_GeomFromWKB(geometry)) AS lat,
       ST_X(ST_GeomFromWKB(geometry)) AS lng,
       addresses[1].freeform   AS address,
       phones[1]               AS phone,
       brand,
       sources[1].dataset      AS source_name
     FROM read_parquet('s3://overturemaps-us-west-2/release/<YYYY-MM-DD>/theme=places/type=place/*', hive_partitioning=1)
     WHERE bbox.xmin BETWEEN :xmin AND :xmax
       AND bbox.ymin BETWEEN :ymin AND :ymax
   ) TO 'overture_<city>.json' (FORMAT JSON);
   ```

   (Foursquare OS Places : même approche sur son GeoParquet / PMTiles.)

3. **Normalisation** vers `PoiSchema` (`src/types/index.ts`), validée Zod.
4. **Conflation** Overture × Foursquare : appariement proximité + nom ; on
   complète les champs manquants (adresse/téléphone/horaires) d'une source par
   l'autre ; on conserve l'identifiant **GERS** quand il existe.
5. **Mapping catégories** source → taxonomie interne (`PoiCategory`) :

   | Interne            | Catégories sources (exemples)                              |
   |--------------------|------------------------------------------------------------|
   | `coworking`        | coworking_space, shared_office                             |
   | `museum`           | museum, art_gallery                                        |
   | `park`             | park, garden                                               |
   | `attraction`       | tourist_attraction, landmark, monument                     |
   | `aquarium-zoo`     | aquarium, zoo                                              |
   | `playground`       | playground                                                 |
   | `family-restaurant`| restaurant (family-friendly)                              |

6. **Horaires** : parser le champ d'ouverture (OSM-like) → `OpeningPeriod[]`
   (0 = lundi). **Couverture partielle honnêtement signalée** : si inconnu,
   `openingHours = null` — on n'invente jamais (anti-pattern #3).
7. **Source** : `sourceStatus = "seed"` (pré-embarqué depuis un jeu ouvert) +
   `sourceName` = "Overture" / "Foursquare". Affichés dans l'UI.

## Hors-ligne

Le seed est embarqué dans le bundle (`src/data/poi.json`) et interrogé par
`src/lib/poi/poi.ts` (pur, sans réseau). Option d'extension : **PMTiles +
DuckDB-wasm** pour interroger les POI directement côté navigateur sur de plus
gros volumes.

## Rafraîchissement

Mensuel (cadence des releases Overture). Relancer l'extraction par bbox,
re-normaliser, re-valider (`npm run validate-seed`) puis committer le `poi.json`
mis à jour. Aucune dépendance runtime n'est ajoutée à l'application.
