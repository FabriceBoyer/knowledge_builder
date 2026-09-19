import { X } from 'lucide-react'
import { posLabel } from '../lib/wordnet'
import type { StoredSense } from '../types'

export function SensePill({ sense, onRemove, onClick }: { sense: StoredSense; onRemove?: () => void; onClick?: () => void }) {
  return <div className="sense-pill" title={`${sense.definition}${sense.examples[0] ? `\nExample: “${sense.examples[0]}”` : ''}`} onClick={onClick}>
    <span className={`pos pos-${sense.pos}`}>{posLabel[sense.pos][0]}</span>
    <span><strong>{sense.lemma}</strong><small>{sense.definition}</small></span>
    {onRemove && <button onClick={(event) => { event.stopPropagation(); onRemove() }} aria-label={`Remove ${sense.lemma}`}><X size={14} /></button>}
  </div>
}
