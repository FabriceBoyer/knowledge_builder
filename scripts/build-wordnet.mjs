import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const pkg = require('wordnet-db')
const dictDir = pkg.path ?? path.join(path.dirname(require.resolve('wordnet-db/package.json')), 'dict')
const outputDir = path.resolve('public/wordnet')
const posFiles = [
  ['noun', 'n'],
  ['verb', 'v'],
  ['adj', 'a'],
  ['adv', 'r'],
]

if (!existsSync(dictDir)) throw new Error(`WordNet dictionary not found at ${dictDir}`)
await mkdir(outputDir, { recursive: true })

const byLemma = new Map()
const synsetById = new Map()

for (const [file, pos] of posFiles) {
  const raw = await readFile(path.join(dictDir, `data.${file}`), 'utf8')
  for (const line of raw.split('\n')) {
    if (!/^\d{8}\s/.test(line)) continue
    const [head, glossRaw = ''] = line.split(' | ', 2)
    const parts = head.trim().split(/\s+/)
    const offset = parts[0]
    const synsetPos = parts[2] === 's' ? 'a' : parts[2]
    const wordCount = Number.parseInt(parts[3], 16)
    const words = []
    let cursor = 4
    for (let i = 0; i < wordCount; i += 1) {
      words.push(parts[cursor].replaceAll('_', ' '))
      cursor += 2
    }
    const [definition = '', ...exampleParts] = glossRaw.split('; ')
    const examples = exampleParts
      .map((value) => value.replace(/^"|"$/g, ''))
      .filter(Boolean)
    const id = `wn:${synsetPos}:${offset}`
    const synset = { id, pos: synsetPos, words, definition, examples }
    synsetById.set(id, synset)
    words.forEach((word, wordIndex) => {
      const key = word.toLowerCase()
      const entry = { ...synset, wordId: `${id}:${wordIndex}`, lemma: word }
      const current = byLemma.get(key) ?? []
      current.push(entry)
      byLemma.set(key, current)
    })
  }
}

const chunkKey = (lemma) => /^[a-z]$/i.test(lemma[0] ?? '') ? lemma[0].toLowerCase() : '_'
const chunks = {}
for (const [lemma, senses] of byLemma) {
  const key = chunkKey(lemma)
  chunks[key] ??= {}
  chunks[key][lemma] = senses
}

const search = [...byLemma.entries()]
  .map(([lemma, senses]) => ({ lemma, count: senses.length, pos: [...new Set(senses.map((sense) => sense.pos))] }))
  .sort((a, b) => a.lemma.localeCompare(b.lemma))

await Promise.all([
  writeFile(path.join(outputDir, 'search.json'), JSON.stringify(search)),
  ...Object.entries(chunks).map(([key, value]) => writeFile(path.join(outputDir, `${key}.json`), JSON.stringify(value))),
  writeFile(path.join(outputDir, 'meta.json'), JSON.stringify({ version: 'WordNet 3.1', lemmas: search.length, synsets: synsetById.size })),
])

console.log(`Built ${synsetById.size.toLocaleString()} synsets and ${search.length.toLocaleString()} searchable lemmas.`)
