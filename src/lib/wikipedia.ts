export const suggestedTopics = [
  { title: 'Double-slit experiment', blurb: 'Wave–particle duality made visible.' },
  { title: 'Theory of relativity', blurb: 'Space, time, gravity, and motion.' },
  { title: 'DNA replication', blurb: 'How life copies its information.' },
  { title: 'Photosynthesis', blurb: 'Light transformed into chemical energy.' },
  { title: 'Falsifiability', blurb: 'A cornerstone of reproducible science.' },
  { title: 'Michelson–Morley experiment', blurb: 'The experiment that challenged the ether.' },
]

export function titleFromWikipediaInput(input: string) {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed)
    if (url.hostname !== 'en.wikipedia.org') throw new Error()
    const match = url.pathname.match(/\/wiki\/(.+)$/)
    if (!match) throw new Error()
    return decodeURIComponent(match[1]).replaceAll('_', ' ')
  } catch {
    if (!trimmed || /^https?:/i.test(trimmed)) throw new Error('Enter an English Wikipedia URL or article title.')
    return trimmed
  }
}

export async function fetchWikipediaArticle(input: string) {
  const title = titleFromWikipediaInput(input)
  const endpoint = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(title)}`
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error('Wikipedia could not be reached.')
  const payload = await response.json()
  const page = Object.values(payload.query.pages)[0] as { title: string; extract?: string; missing?: boolean }
  if (page.missing || !page.extract) throw new Error(`No English Wikipedia article found for “${title}”.`)
  return { title: page.title, extract: page.extract, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}` }
}
