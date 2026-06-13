# Guide d'utilisation — Odyssée

Odyssée est votre **carnet de route PWA** : il planifie un voyage en Tesla en
tenant compte, comme **règles de premier ordre**, des contraintes du foyer
(bébé, médical, télétravail). Tout fonctionne **hors-ligne** et **sans clé**
(mode démonstration) ; les vraies intégrations s'activent par variables
d'environnement.

> Installable comme application : depuis le navigateur, « Ajouter à l'écran
> d'accueil ». Un bandeau apparaît quand vous passez hors-ligne — vos données
> restent disponibles.

---

## 1. Profil Foyer — `/parametres`

Le **Profil Foyer** est le cœur du moteur : chaque contrainte qu'il contient
façonne les itinéraires, les pauses et les hébergements proposés.

- **Bébé** : âge, pause maxi entre deux arrêts (90–120 min), fenêtre de blocage
  canicule (12h–16h par défaut).
- **Médical** : matelas ferme obligatoire, climatisation requise.
- **Télétravail** : jours travaillés (lun–jeu), horaires (8h30–19h), bureau
  ≥ 120 cm, fibre + secours 5G. Option **bureau partagé proche** (coworking à
  ≤ 10 min en skateboard) qui assouplit le late checkout.
- **Conduite** : durée maxi d'un trajet sans étape.

Chaque enregistrement **incrémente la version** du profil (affichée `vN`) et
l'horodate. Le profil est consommé à chaque génération.

### Connexion Tesla

Section « Connexion Tesla » : connectez le compte (mock par défaut), choisissez
le véhicule, lisez l'**état de charge** (SoC) et l'autonomie. La source (Démo /
Compte réel) est toujours affichée. Lecture **ponctuelle** et **mise en cache**
pour limiter le coût de la Fleet API.

---

## 2. Planifier — `/plan`

Trois outils sur la même page :

1. **Générer le voyage de référence** — produit le carnet complet Fresnes ↔
   Marseille (étapes, recharges, hébergements, contraintes).
2. **Générer par IA** — décrivez votre voyage en texte libre : l'IA propose un
   itinéraire **structuré et éditable** (titres + activités par jour) respectant
   le Profil Foyer. Fonctionne sans clé (brouillon déterministe) ; avec
   `ANTHROPIC_API_KEY`, c'est Claude qui rédige.
3. **Trajet charge-aware** — choisissez le SoC de départ (réel, lu du véhicule,
   ou cible) et le SoC d'arrivée souhaité ; obtenez les **arrêts Superchargeurs**
   (SoC arrivée/départ, durée, préconditionnement) et une **chronologie heure par
   heure** intégrant pauses bébé, blocage canicule et heures de télétravail.

---

## 3. Carnet de route — `/carnet`

Le voyage généré, jour par jour. Dépliez une journée pour voir la conduite, les
recharges, l'**hébergement suggéré** (avec sa **conformité télétravail** :
bureau / clim / 5G / matelas), les **réservations** rattachées à la date, et la
connectivité. Boutons : **Exporter JSON**, **Partager** (lien), **Calendrier
.ics**, **Imprimer**.

---

## 4. Budget & dépenses — `/budget`

- Ajoutez des dépenses (poste, payeur, partage entre voyageurs).
- **Ventilation par poste** (barres budget vs dépensé, alerte dépassement).
- **Découpage** façon Lambus : solde de chacun et **règlements minimaux**
  suggérés pour équilibrer les comptes.

---

## 5. Liste de bagages — `/bagages`

Liste **générée automatiquement** selon la durée, la saison (déduite du mois) et
le bébé : quantités échelonnées (couches, vêtements…), sections bébé / été ou
hiver / télétravail / Tesla / documents. Cochez au fur et à mesure — l'état est
mémorisé.

---

## 6. Réservations — `/reservations`

Collez un e-mail de confirmation : Odyssée **extrait** la réservation (type,
dates, n° de confirmation, prestataire, lieu), que vous pouvez corriger avant
de l'ajouter. Les réservations sont **agrégées dans l'itinéraire** (elles
apparaissent dans la journée correspondante du carnet) et exportables en .ics.

---

## 7. Vote des activités — `/collaboration`

Faites participer la famille : chacun saisit son prénom et **approuve** les
activités qui lui plaisent (plusieurs choix possibles). Le décompte est trié.
« Copier le lien de vote » génère une URL contenant le sondage — partagez-la, et
les votes reçus à l'ouverture **se fusionnent** automatiquement (sans serveur).

---

## 8. Hors-ligne

L'app est *offline-first* : le carnet, le budget, les bagages, les réservations,
le vote et les cartes d'étape (SVG) restent consultables **sans réseau**. Seules
la génération IA et les cartes haute résolution nécessitent une connexion. La
page `/offline` rappelle ce qui reste disponible.

---

## Modes & confidentialité

- **Mode MOCK** (défaut) : tout est démontrable sans aucune clé.
- **Mode LIVE** : activé par `NEXT_PUBLIC_APP_MODE=live` + les clés
  correspondantes (Anthropic, Tesla Fleet API…).
- Vos données (profil, dépenses, votes) vivent **dans votre navigateur**
  (IndexedDB). Aucune télémétrie. Voir [`SECURITY.md`](../SECURITY.md).
