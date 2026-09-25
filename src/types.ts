export type Pos = 'n' | 'v' | 'a' | 'r'

export interface SearchEntry {
  lemma: string
  count: number
  pos: Pos[]
}

export interface Sense {
  id: string
  wordId: string
  lemma: string
  pos: Pos
  words: string[]
  definition: string
  examples: string[]
}

export interface StoredSense extends Sense {
  addedAt: number
  groups?: string[]
  labels?: string[]
}

export interface ConceptNode {
  id: string
  senseId: string
  position: { x: number; y: number }
}

export interface ConceptEdge {
  id: string
  source: string
  target: string
  linkerSenseId: string
}

export interface GraphDocument {
  id: string
  name: string
  nodes: ConceptNode[]
  edges: ConceptEdge[]
  createdAt: number
  updatedAt: number
}

export interface ArticleAnnotation {
  id: string
  text: string
  senseId: string
  start?: number
  end?: number
}

export interface ArticleDocument {
  url: string
  title: string
  extract: string
  annotations: ArticleAnnotation[]
  source?: 'wikipedia' | 'example'
}

export interface WorkspaceState {
  senses: StoredSense[]
  graphs: GraphDocument[]
  activeGraphId: string
  article?: ArticleDocument
}
