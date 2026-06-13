/**
 * Collaboration — vote sur les activités (M9), pur et testé.
 *
 * Vote par **approbation** : chaque membre de la famille peut approuver
 * plusieurs activités. Le sondage est **fusionnable** (union déterministe des
 * options et des votes) pour permettre un partage par URL sans serveur, puis
 * la consolidation des votes reçus.
 */

export interface ActivityOption {
  id: string
  label: string
}

export interface Vote {
  voter: string
  optionId: string
}

export interface Poll {
  options: ActivityOption[]
  votes: Vote[]
}

export interface PollTally {
  optionId: string
  label: string
  count: number
  voters: string[]
}

export function emptyPoll(): Poll {
  return { options: [], votes: [] }
}

/** Ajoute une option (id stable dérivé du libellé) si absente. */
export function addOption(poll: Poll, label: string): Poll {
  const trimmed = label.trim()
  if (!trimmed) return poll
  const id = slugId(trimmed)
  if (poll.options.some((o) => o.id === id)) return poll
  return { ...poll, options: [...poll.options, { id, label: trimmed }] }
}

/** Bascule l'approbation d'un votant pour une option (ajoute/retire). */
export function toggleVote(poll: Poll, voter: string, optionId: string): Poll {
  const v = voter.trim()
  if (!v) return poll
  const exists = poll.votes.some((x) => x.voter === v && x.optionId === optionId)
  return {
    ...poll,
    votes: exists
      ? poll.votes.filter((x) => !(x.voter === v && x.optionId === optionId))
      : [...poll.votes, { voter: v, optionId }],
  }
}

/** Décompte trié : le plus approuvé d'abord, puis ordre des options. */
export function tally(poll: Poll): PollTally[] {
  const order = new Map(poll.options.map((o, i) => [o.id, i]))
  return poll.options
    .map((o) => {
      const voters = poll.votes
        .filter((v) => v.optionId === o.id)
        .map((v) => v.voter)
        .filter((name, i, arr) => arr.indexOf(name) === i)
        .sort((a, b) => a.localeCompare(b))
      return { optionId: o.id, label: o.label, count: voters.length, voters }
    })
    .sort((a, b) => b.count - a.count || (order.get(a.optionId)! - order.get(b.optionId)!))
}

/** Liste triée des votants connus. */
export function voters(poll: Poll): string[] {
  return [...new Set(poll.votes.map((v) => v.voter))].sort((a, b) => a.localeCompare(b))
}

/**
 * Fusionne deux sondages : union des options (par id) et des votes (dédupliqués
 * par votant+option). Déterministe, idempotente, commutative sur les ensembles.
 */
export function mergePolls(a: Poll, b: Poll): Poll {
  const optionsById = new Map<string, ActivityOption>()
  for (const o of [...a.options, ...b.options]) {
    if (!optionsById.has(o.id)) optionsById.set(o.id, o)
  }
  const voteKeys = new Set<string>()
  const votes: Vote[] = []
  for (const v of [...a.votes, ...b.votes]) {
    const key = `${v.voter} ${v.optionId}`
    if (!voteKeys.has(key) && optionsById.has(v.optionId)) {
      voteKeys.add(key)
      votes.push(v)
    }
  }
  return { options: [...optionsById.values()], votes }
}

function slugId(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48)
}

/** Activités candidates par défaut pour amorcer le vote familial. */
export function defaultPoll(): Poll {
  const labels = [
    "Visite du centre historique",
    "Après-midi piscine / baignade",
    "Marché local & déjeuner",
    "Musée climatisé",
    "Balade nature à l'ombre",
    "Restaurant en terrasse",
  ]
  return labels.reduce((p, l) => addOption(p, l), emptyPoll())
}
