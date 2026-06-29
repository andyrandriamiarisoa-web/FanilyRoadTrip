# Connexion Tesla Fleet API — guide de mise en service (mode LIVE)

> En mode `mock` (défaut), **rien de tout ceci n'est requis** : un véhicule de
> démonstration déterministe est servi sans réseau ni clé. Ce guide ne concerne
> que le passage en **LIVE réel** avec un compte Tesla.

L'app utilise la **Tesla Fleet API** — l'unique API Tesla moderne (l'ancienne
*Owner API* est supprimée). Elle fonctionne pour un **compte personnel à un seul
véhicule** : aucune notion de « flotte » commerciale n'est nécessaire.

## 1. Créer l'application Tesla Developer

Sur <https://developer.tesla.com> :

1. Créez une application. Notez **`Client ID`** et **`Client Secret`**.
2. **Type d'autorisation OAuth** : `authorization-code` (lecture/commandes) +
   `client-credentials` (enregistrement du domaine).
3. **Origine autorisée** : `https://votre-domaine.example`
4. **URI de redirection** : `https://votre-domaine.example/api/tesla/callback`
   ⚠️ Ce chemin exact — c'est la route OAuth de l'app.
5. **Scopes** : a minima `vehicle_device_data` (lecture). Pour les commandes
   confort/charge : `vehicle_cmds` + `vehicle_charging_cmds`. `offline_access`
   est demandé automatiquement (nécessaire au rafraîchissement du token).

## 2. Héberger la clé publique de domaine

Tesla valide votre domaine via une clé publique servie à un chemin fixe.

1. Générez une paire de clés (courbe EC `prime256v1`).
2. Mettez la **clé publique PEM** dans `TESLA_PUBLIC_KEY_PEM`. L'app la sert sous
   `/.well-known/appspecific/com.tesla.3p.public-key.pem`.

## 3. Variables d'environnement (serveur)

| Variable | Rôle |
|----------|------|
| `NEXT_PUBLIC_APP_MODE=live` | Active le mode réel |
| `TESLA_CLIENT_ID` | ID client OAuth |
| `TESLA_CLIENT_SECRET` | Secret client OAuth |
| `TESLA_REDIRECT_URI` | `https://votre-domaine.example/api/tesla/callback` |
| `TESLA_TOKEN_SECRET` | Clé 32+ car. (chiffrement AES-256-GCM des jetons) — `openssl rand -base64 32` |
| `TESLA_PUBLIC_KEY_PEM` | Clé publique de domaine (PEM) |
| `TESLA_FLEET_API_BASE` | *(optionnel)* base régionale ; sinon découverte auto |

## 4. Enregistrer le domaine dans la région (étape unique)

Sans cet enregistrement, les endpoints véhicule renvoient **403** (« Account must
be registered in the current region »). Une fois les variables en place et la clé
publique accessible :

```bash
curl -X POST https://votre-domaine.example/api/tesla/partner/register
```

À refaire une fois **par région** (EU, NA…). La région cible vient de
`TESLA_FLEET_API_BASE` (ou la base par défaut).

## 5. Connexion utilisateur

Dans l'app, **Paramètres → Connexion Tesla → « Connecter mon compte Tesla »**.
Vous êtes redirigé vers Tesla (consentement), puis ramené à `/parametres`. Les
jetons (access + refresh) sont **chiffrés** dans un cookie httpOnly et
**rafraîchis automatiquement** ; ils ne touchent jamais le navigateur en clair.

## Région — la cause n°1 du 403

Un compte **européen** doit utiliser la base **EU**
(`https://fleet-api.prd.eu.vn.cloud.tesla.com`). L'app la **découvre
automatiquement** via `GET /api/1/users/region` après connexion. Pour vérifier
manuellement votre base :

```bash
curl https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/users/region \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Commandes & clé virtuelle (Virtual Key)

- **Lecture** (SoC, autonomie) : aucune clé virtuelle ni signature requise.
- **Commandes** : les véhicules **2021+** (et Model 3/Y) exigent des **commandes
  signées** (Vehicle Command Protocol) via un proxy de signature dédié —
  incompatible avec un déploiement serverless. L'app envoie des **commandes
  legacy**, compatibles avec les véhicules **d'avant 2021** (ex. Model S *Raven*).
- Si un véhicule exige des commandes signées, l'app l'**affiche honnêtement**
  plutôt que de simuler un succès.

## Véhicule « en veille » — pourquoi le SoC n'apparaît pas tout de suite

La Fleet API renvoie souvent `state: "asleep"` **même quand la voiture
s'affiche dans l'app Tesla** : Tesla laisse le véhicule dormir pour préserver
la batterie (l'app maintient, elle, une connexion live qui le réveille). Tant
que le véhicule est endormi, `vehicle_data` (donc le SoC réel) n'est pas
lisible.

L'app **ne fabrique pas** un faux 0 % dans ce cas (anti-pattern #3) : elle
affiche honnêtement « Véhicule en veille » et propose **« Réveiller et lire
l'état »**. Ce bouton envoie `wake_up` (commande legacy, compatible Raven)
puis **sonde l'état quelques fois** (~3 s × 7) jusqu'à ce que la Fleet API
repasse `online`, et affiche alors les vraies valeurs. L'état non-`online`
n'est **jamais mis en cache** (sinon le sondage post-réveil resterait bloqué
sur la valeur endormie pendant tout le TTL).

## Coût Fleet API

Chaque lecture `vehicle_data` est facturée. L'app met l'état **en ligne** en
cache (`TESLA_STATE_CACHE_TTL_SECONDS`, défaut 5 min) : au plus **une lecture
facturable par véhicule et par fenêtre**, sans réveil automatique ni polling
de fond. Seul un **réveil explicite** demandé par l'utilisateur déclenche un
court sondage borné.
