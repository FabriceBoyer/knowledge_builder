import { Tag, X } from 'lucide-react'
import { posLabel } from '../lib/wordnet'
import type { StoredSense } from '../types'

export function SensePill({ sense, onRemove, onClick, onOrganize }: { sense: StoredSense; onRemove?: () => void; onClick?: () => void; onOrganize?: () => void }) {
  return <div className="sense-pill" title={`${sense.definition}${sense.examples[0] ? `\nExample: “${sense.examples[0]}”` : ''}`} onClick={onClick}>
    <span className={`pos pos-${sense.pos}`}>{posLabel[sense.pos][0]}</span>
    <span><strong>{sense.lemma}</strong><small>{sense.definition}</small>{(sense.groups?.length || sense.labels?.length) ? <span className="sense-meta">{[...(sense.groups ?? []).map((item) => `#${item}`), ...(sense.labels ?? []).map((item) => item)].slice(0, 3).map((item) => <i key={item}>{item}</i>)}</span> : null}</span>
    {onOrganize && <button onClick={(event) => { event.stopPropagation(); onOrganize() }} aria-label={`Organize ${sense.lemma}`}><Tag size={13} /></button>}
    {onRemove && <button onClick={(event) => { event.stopPropagation(); onRemove() }} aria-label={`Remove ${sense.lemma}`}><X size={14} /></button>}
  </div>
}
