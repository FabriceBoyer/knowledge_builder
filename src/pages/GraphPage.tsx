import { useCallback, useMemo, useState } from 'react'
import { Background, ConnectionMode, Controls, Handle, MiniMap, Position, ReactFlow, applyNodeChanges, reconnectEdge, type Connection, type Edge, type Node, type NodeChange, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowRight, ChevronDown, CirclePlus, Columns3, FilePlus2, LayoutTemplate, Network, Pencil, Plus, Share2, Trash2, X } from 'lucide-react'
import { SensePill } from '../components/SensePill'
import { SenseSearch } from '../components/SenseSearch'
import { useWorkspace } from '../context/WorkspaceContext'
import { getSenses, posLabel } from '../lib/wordnet'
import type { ConceptEdge, GraphDocument, Sense, StoredSense } from '../types'

type SemanticNode = Node<{ sense?: StoredSense; onEdit: (id: string) => void; onDelete: (id: string) => void }, 'semantic'>
type LinkEditor = { mode: 'create'; connection: Connection } | { mode: 'edit'; edgeId: string }
type EditorView = 'canvas' | 'columns'
type LayoutAlgorithm = 'manual' | 'hierarchy-horizontal' | 'hierarchy-vertical' | 'radial' | 'grid'
const GRAPH_NODE_WIDTH = 210
const GRAPH_NODE_HEIGHT = 88

const miniMapColor = (node: Node) => {
  const pos = (node.data as SemanticNode['data']).sense?.pos
  return pos === 'v' ? '#ef684d' : pos === 'a' ? '#78adbc' : pos === 'r' ? '#b98ccf' : '#75b99a'
}

function SemanticNodeCard({ id, data, selected }: NodeProps<SemanticNode>) {
  const sense = data.sense
  return <div className={`graph-node ${selected ? 'selected' : ''}`}>
    <Handle type="target" position={Position.Left} aria-label={`Drag a connection to ${sense?.lemma ?? 'node'}`} />
    <div className="graph-node-heading"><span>{sense?.lemma ?? 'Missing sense'}</span><div><button onClick={() => data.onEdit(id)} aria-label={`Edit ${sense?.lemma ?? 'entity'}`}><Pencil size={12} /></button><button onClick={() => data.onDelete(id)} aria-label={`Delete ${sense?.lemma ?? 'entity'}`}><Trash2 size={12} /></button></div></div>
    <small>{sense?.definition}</small>
    <Handle type="source" position={Position.Right} aria-label={`Drag a connection from ${sense?.lemma ?? 'node'}`} />
  </div>
}

const nodeTypes = { semantic: SemanticNodeCard }

function hierarchyPositions(graph: GraphDocument, horizontal: boolean) {
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]))
  graph.edges.forEach((edge) => {
    if (!incoming.has(edge.source) || !incoming.has(edge.target)) return
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  })
  const levels = new Map<string, number>()
  const queue = graph.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id)
  if (!queue.length && graph.nodes[0]) queue.push(graph.nodes[0].id)
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const source = queue[cursor]
    const level = levels.get(source) ?? 0
    levels.set(source, level)
    outgoing.get(source)?.forEach((target) => {
      levels.set(target, Math.max(levels.get(target) ?? 0, level + 1))
      incoming.set(target, (incoming.get(target) ?? 1) - 1)
      if (incoming.get(target) === 0) queue.push(target)
    })
  }
  let fallbackLevel = Math.max(0, ...levels.values()) + 1
  graph.nodes.forEach((node) => { if (!levels.has(node.id)) levels.set(node.id, fallbackLevel++) })
  const lanes = new Map<number, string[]>()
  graph.nodes.forEach((node) => { const level = levels.get(node.id) ?? 0; lanes.set(level, [...(lanes.get(level) ?? []), node.id]) })
  const positions = new Map<string, { x: number; y: number }>()
  lanes.forEach((ids, level) => ids.forEach((id, index) => positions.set(id, horizontal
    ? { x: 70 + level * 300, y: 70 + index * 145 }
    : { x: 70 + index * 250, y: 70 + level * 165 })))
  return positions
}

function radialPositions(graph: GraphDocument) {
  if (!graph.nodes.length) return new Map<string, { x: number; y: number }>()
  const neighbours = new Map(graph.nodes.map((node) => [node.id, [] as string[]]))
  graph.edges.forEach((edge) => { neighbours.get(edge.source)?.push(edge.target); neighbours.get(edge.target)?.push(edge.source) })
  const root = graph.nodes.find((node) => !graph.edges.some((edge) => edge.target === node.id)) ?? graph.nodes[0]
  const distances = new Map([[root.id, 0]])
  const queue = [root.id]
  for (let cursor = 0; cursor < queue.length; cursor += 1) neighbours.get(queue[cursor])?.forEach((id) => {
    if (distances.has(id)) return
    distances.set(id, (distances.get(queue[cursor]) ?? 0) + 1)
    queue.push(id)
  })
  let orphanRing = Math.max(0, ...distances.values()) + 1
  graph.nodes.forEach((node) => { if (!distances.has(node.id)) distances.set(node.id, orphanRing++) })
  const rings = new Map<number, string[]>()
  graph.nodes.forEach((node) => { const ring = distances.get(node.id) ?? 0; rings.set(ring, [...(rings.get(ring) ?? []), node.id]) })
  const positions = new Map<string, { x: number; y: number }>()
  const center = { x: 480, y: 330 }
  rings.forEach((ids, ring) => ids.forEach((id, index) => {
    if (ring === 0) positions.set(id, center)
    else { const angle = (Math.PI * 2 * index) / ids.length - Math.PI / 2; const radius = ring * 210; positions.set(id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }) }
  }))
  return positions
}

function gridPositions(graph: GraphDocument) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(graph.nodes.length)))
  return new Map(graph.nodes.map((node, index) => [node.id, { x: 70 + (index % columns) * 250, y: 70 + Math.floor(index / columns) * 150 }]))
}

export function GraphPage() {
  const { state, setState, addSense, createGraph, deleteGraph, updateGraph } = useWorkspace()
  const graph = state.graphs.find((item) => item.id === state.activeGraphId) ?? state.graphs[0]
  const [view, setView] = useState<EditorView>(() => window.matchMedia('(max-width: 620px)').matches ? 'columns' : 'canvas')
  const [linkEditor, setLinkEditor] = useState<LinkEditor | null>(null)
  const [entityEditor, setEntityEditor] = useState<string | null>(null)
  const [formSource, setFormSource] = useState('')
  const [formTarget, setFormTarget] = useState('')
  const [quickEntry, setQuickEntry] = useState('')
  const [quickNotice, setQuickNotice] = useState('')
  const [layoutAlgorithm, setLayoutAlgorithm] = useState<LayoutAlgorithm>('manual')
  const compactCanvas = window.matchMedia('(max-width: 620px)').matches
  const senses = useMemo(() => new Map(state.senses.map((sense) => [sense.wordId, sense])), [state.senses])
  const persist = useCallback((next: Partial<GraphDocument>) => updateGraph({ ...graph, ...next }), [graph, updateGraph])
  const nodeLabel = useCallback((nodeId: string) => senses.get(graph.nodes.find((node) => node.id === nodeId)?.senseId ?? '')?.lemma ?? 'Missing sense', [graph.nodes, senses])

  const deleteEntity = useCallback((nodeId: string) => {
    const linked = graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId).length
    const label = nodeLabel(nodeId)
    if (!window.confirm(`Delete “${label}”${linked ? ` and its ${linked} relationship${linked === 1 ? '' : 's'}` : ''}?`)) return
    persist({ nodes: graph.nodes.filter((node) => node.id !== nodeId), edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId) })
    setEntityEditor(null)
  }, [graph.edges, graph.nodes, nodeLabel, persist])

  const nodes: SemanticNode[] = graph.nodes.map((node) => {
    const sense = senses.get(node.senseId)
    return { id: node.id, type: 'semantic', position: node.position, width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT, data: { sense, onEdit: setEntityEditor, onDelete: deleteEntity }, className: `flow-node pos-${sense?.pos ?? 'n'}` }
  })
  const edges: Edge[] = graph.edges.map((edge) => {
    const linker = senses.get(edge.linkerSenseId)
    return { id: edge.id, source: edge.source, target: edge.target, label: linker?.lemma ?? 'relates to', className: 'semantic-edge', animated: true, reconnectable: true, interactionWidth: 28 }
  })

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const positionChanges = changes.filter((change) => change.type === 'position')
    if (!positionChanges.length) return
    const changed = applyNodeChanges(positionChanges, nodes)
    persist({ nodes: changed.map((node) => ({ id: node.id, senseId: graph.nodes.find((item) => item.id === node.id)?.senseId ?? '', position: node.position })) })
  }, [nodes, graph.nodes, persist])

  const onReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    const changed = reconnectEdge(oldEdge, connection, edges)
    persist({ edges: changed.map((edge) => {
      const stored = graph.edges.find((item) => item.id === edge.id)!
      return { ...stored, source: edge.source, target: edge.target }
    }).filter(Boolean) })
  }, [edges, graph.edges, persist])

  function addNode(senseId: string) {
    if (graph.nodes.some((node) => node.senseId === senseId)) return
    persist({ nodes: [...graph.nodes, { id: crypto.randomUUID(), senseId, position: { x: 100 + (graph.nodes.length % 3) * 240, y: 80 + Math.floor(graph.nodes.length / 3) * 150 } }] })
  }

  function applyLayout() {
    if (layoutAlgorithm === 'manual') return
    const positions = layoutAlgorithm === 'hierarchy-horizontal' ? hierarchyPositions(graph, true)
      : layoutAlgorithm === 'hierarchy-vertical' ? hierarchyPositions(graph, false)
        : layoutAlgorithm === 'radial' ? radialPositions(graph) : gridPositions(graph)
    persist({ nodes: graph.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })) })
  }

  function replaceEntity(sense: Sense) {
    if (!entityEditor) return
    addSense(sense)
    if (graph.nodes.some((node) => node.id !== entityEditor && node.senseId === sense.wordId)) {
      window.alert('This sense is already an entity in the current concept.')
      return
    }
    persist({ nodes: graph.nodes.map((node) => node.id === entityEditor ? { ...node, senseId: sense.wordId } : node) })
    setEntityEditor(null)
  }

  function linkWith(sense: Sense) {
    addSense(sense)
    if (!linkEditor) return
    if (linkEditor.mode === 'edit') {
      persist({ edges: graph.edges.map((edge) => edge.id === linkEditor.edgeId ? { ...edge, linkerSenseId: sense.wordId } : edge) })
    } else if (linkEditor.connection.source && linkEditor.connection.target) {
      const semantic: ConceptEdge = { id: crypto.randomUUID(), source: linkEditor.connection.source, target: linkEditor.connection.target, linkerSenseId: sense.wordId }
      persist({ edges: [...graph.edges, semantic] })
      setFormSource('')
      setFormTarget('')
    }
    setLinkEditor(null)
  }

  function deleteLink(edgeId: string) {
    if (!window.confirm('Delete this semantic relationship?')) return
    persist({ edges: graph.edges.filter((edge) => edge.id !== edgeId) })
    setLinkEditor(null)
  }

  function removeGraph() {
    if (state.graphs.length === 1 || !window.confirm(`Delete the concept “${graph.name}”?`)) return
    deleteGraph(graph.id)
  }

  async function resolveToken(token: string) {
    const match = token.trim().match(/^(.+?)\s*#\s*(\d+)$/)
    if (!match) throw new Error(`“${token.trim()}” must use word#sense-number.`)
    const choices = await getSenses(match[1].trim())
    const sense = choices[Number(match[2]) - 1]
    if (!sense) throw new Error(`WordNet has no sense ${match[2]} for “${match[1].trim()}”.`)
    return sense
  }

  async function importQuickEntries() {
    const lines = quickEntry.split('\n').map((line) => line.trim()).filter(Boolean)
    if (!lines.length) return
    setQuickNotice('Resolving WordNet senses…')
    try {
      const entries = await Promise.all(lines.map(async (line, index) => {
        const parts = line.split(/(?:->|→)/).map((part) => part.trim()).filter(Boolean)
        if (parts.length !== 1 && parts.length !== 3) throw new Error(`Line ${index + 1} must be one entity or source → relation → target.`)
        return { parts, senses: await Promise.all(parts.map(resolveToken)) }
      }))
      let entitiesAdded = 0
      let relationshipsAdded = 0
      setState((current) => {
        const active = current.graphs.find((item) => item.id === graph.id)
        if (!active) return current
        const allSenses = [...current.senses]
        const nodes = [...active.nodes]
        const edges = [...active.edges]
        const ensureSense = (sense: Sense) => {
          if (!allSenses.some((item) => item.wordId === sense.wordId)) allSenses.push({ ...sense, addedAt: Date.now() })
        }
        const ensureNode = (sense: Sense) => {
          ensureSense(sense)
          let node = nodes.find((item) => item.senseId === sense.wordId)
          if (!node) {
            const index = nodes.length
            node = { id: crypto.randomUUID(), senseId: sense.wordId, position: { x: 100 + (index % 4) * 260, y: 80 + Math.floor(index / 4) * 160 } }
            nodes.push(node)
            entitiesAdded += 1
          }
          return node
        }
        entries.forEach(({ senses: resolved }) => {
          if (resolved.length === 1) ensureNode(resolved[0])
          else {
            const source = ensureNode(resolved[0])
            const target = ensureNode(resolved[2])
            ensureSense(resolved[1])
            if (!edges.some((edge) => edge.source === source.id && edge.target === target.id && edge.linkerSenseId === resolved[1].wordId)) {
              edges.push({ id: crypto.randomUUID(), source: source.id, target: target.id, linkerSenseId: resolved[1].wordId })
              relationshipsAdded += 1
            }
          }
        })
        const updated = { ...active, nodes, edges, updatedAt: Date.now() }
        return { ...current, senses: allSenses, graphs: current.graphs.map((item) => item.id === active.id ? updated : item) }
      })
      setQuickNotice(`${entitiesAdded} ${entitiesAdded === 1 ? 'entity' : 'entities'} and ${relationshipsAdded} ${relationshipsAdded === 1 ? 'relationship' : 'relationships'} added.`)
      setQuickEntry('')
    } catch (error) {
      setQuickNotice(error instanceof Error ? error.message : 'Could not import these entries.')
    }
  }

  const editingSense = linkEditor?.mode === 'edit' ? senses.get(graph.edges.find((edge) => edge.id === linkEditor.edgeId)?.linkerSenseId ?? '') : undefined
  const editingEntitySense = senses.get(graph.nodes.find((node) => node.id === entityEditor)?.senseId ?? '')
  const linkedNodeIds = new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]))
  const isolatedNodes = graph.nodes.filter((node) => !linkedNodeIds.has(node.id))

  return <div className={`graph-page view-${view}`}>
    <aside className="graph-sidebar">
      <div className="sidebar-top"><div className="eyebrow"><Network size={14} /> Composer</div><h1>Concept graph</h1></div>
      <div className="graph-view-switch" aria-label="Editor view"><button className={view === 'canvas' ? 'active' : ''} onClick={() => setView('canvas')}><Share2 size={14} /> Canvas</button><button className={view === 'columns' ? 'active' : ''} onClick={() => setView('columns')}><Columns3 size={14} /> Columns</button></div>
      <div className="graph-select-row">
        <div className="select-wrap"><select value={graph.id} onChange={(event) => setState((current) => ({ ...current, activeGraphId: event.target.value }))}>{state.graphs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={15} /></div>
        <button className="icon-button" onClick={createGraph} aria-label="New graph"><Plus size={18} /></button>
        <button className="icon-button danger" onClick={removeGraph} disabled={state.graphs.length === 1} aria-label="Delete graph"><Trash2 size={17} /></button>
      </div>
      <input className="graph-name" value={graph.name} onChange={(event) => persist({ name: event.target.value })} aria-label="Graph name" />
      <div className="graph-layout-control"><label><LayoutTemplate size={14} /> Layout<select value={layoutAlgorithm} onChange={(event) => setLayoutAlgorithm(event.target.value as LayoutAlgorithm)}><option value="manual">Manual positions</option><option value="hierarchy-horizontal">Hierarchy · left to right</option><option value="hierarchy-vertical">Hierarchy · top to bottom</option><option value="radial">Radial · connected rings</option><option value="grid">Grid · compact overview</option></select></label><button className="secondary-button" onClick={applyLayout} disabled={layoutAlgorithm === 'manual'}>Apply</button><small>{layoutAlgorithm === 'manual' ? 'Drag entities freely; their positions are saved.' : 'Applies a layout and then leaves every entity editable by hand.'}</small></div>
      <div className="graph-link-builder">
        <div className="sidebar-label">Create a relationship</div>
        <div className="graph-link-fields">
          <select aria-label="Link source" value={formSource} onChange={(event) => setFormSource(event.target.value)}><option value="">From…</option>{graph.nodes.map((node) => <option key={node.id} value={node.id}>{nodeLabel(node.id)}</option>)}</select>
          <span aria-hidden="true">→</span>
          <select aria-label="Link target" value={formTarget} onChange={(event) => setFormTarget(event.target.value)}><option value="">To…</option>{graph.nodes.map((node) => <option key={node.id} value={node.id}>{nodeLabel(node.id)}</option>)}</select>
          <button className="primary-button" disabled={!formSource || !formTarget || formSource === formTarget} onClick={() => setLinkEditor({ mode: 'create', connection: { source: formSource, target: formTarget, sourceHandle: null, targetHandle: null } })}>Link</button>
        </div>
      </div>
      <details className="quick-entry-panel">
        <summary><FilePlus2 size={14} /> Quick add</summary>
        <p>Add one entity per line with <code>word#sense</code>, or create entities and a relationship with <code>source#n → relation#n → target#n</code>.</p>
        <textarea value={quickEntry} onChange={(event) => { setQuickEntry(event.target.value); setQuickNotice('') }} placeholder={'system#1\ncause#2 → produce#1 → effect#1'} aria-label="Quick concept and relationship entry" spellCheck="false" />
        <button className="secondary-button" onClick={() => void importQuickEntries()} disabled={!quickEntry.trim()}>Add entries</button>
        {quickNotice && <small className={quickNotice.startsWith('Resolving') || quickNotice.includes('added.') ? 'quick-notice success' : 'quick-notice error'}>{quickNotice}</small>}
      </details>
      <div className="sidebar-label">Sense palette <span>{state.senses.length}</span></div>
      <div className="node-palette">
        {state.senses.map((sense) => <SensePill key={sense.wordId} sense={sense} onClick={() => addNode(sense.wordId)} />)}
        {!state.senses.length && <p className="muted">Collect senses in the Sense lab, then return here to compose them.</p>}
      </div>
      <div className="sidebar-search"><SenseSearch compact onSelect={(sense) => { addSense(sense); addNode(sense.wordId) }} placeholder="Find another entity…" /></div>
    </aside>

    {view === 'canvas' ? <section className="graph-canvas">
      <div className="canvas-hint"><CirclePlus size={15} /> Drag to connect · use the node actions to edit or delete.</div>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={(connection) => setLinkEditor({ mode: 'create', connection })} onReconnect={onReconnect} onNodeDoubleClick={(_, node) => setEntityEditor(node.id)} onEdgeDoubleClick={(_, edge) => setLinkEditor({ mode: 'edit', edgeId: edge.id })} connectionMode={ConnectionMode.Strict} edgesReconnectable fitView fitViewOptions={{ minZoom: compactCanvas ? 1 : 0.1, maxZoom: 1 }} minZoom={compactCanvas ? 0.75 : 0.5} deleteKeyCode={null}>
        <Background gap={24} size={1} /><Controls /><MiniMap pannable zoomable nodeColor={miniMapColor} nodeStrokeColor="#101815" nodeStrokeWidth={2} nodeBorderRadius={5} bgColor="#18221f" maskColor="rgba(16, 24, 21, 0.65)" maskStrokeColor="#ff8066" ariaLabel="Graph overview: drag or click to navigate the canvas" />
      </ReactFlow>
    </section> : <section className="column-editor">
      <header><div><div className="eyebrow"><Columns3 size={14} /> Text editor</div><h2>{graph.name}</h2><p>Edit the same semantic model as readable statements. No canvas, dragging, or zooming required.</p></div><span>{graph.nodes.length} entities · {graph.edges.length} relationships</span></header>
      <div className="statement-table" role="table" aria-label="Semantic relationships">
        <div className="statement-head" role="row"><span>Source entity</span><span>Relationship</span><span>Target entity</span><span>Actions</span></div>
        {graph.edges.map((edge) => <div className="statement-row" role="row" key={edge.id}>
          <button className="entity-cell" onClick={() => setEntityEditor(edge.source)}><strong>{nodeLabel(edge.source)}</strong><small>{senses.get(graph.nodes.find((node) => node.id === edge.source)?.senseId ?? '')?.definition}</small></button>
          <button className="relation-cell" onClick={() => setLinkEditor({ mode: 'edit', edgeId: edge.id })}><ArrowRight size={14} /><strong>{senses.get(edge.linkerSenseId)?.lemma ?? 'Missing relation'}</strong><small>{senses.get(edge.linkerSenseId)?.definition}</small></button>
          <button className="entity-cell" onClick={() => setEntityEditor(edge.target)}><strong>{nodeLabel(edge.target)}</strong><small>{senses.get(graph.nodes.find((node) => node.id === edge.target)?.senseId ?? '')?.definition}</small></button>
          <div className="statement-actions"><button onClick={() => setLinkEditor({ mode: 'edit', edgeId: edge.id })} aria-label="Edit relationship"><Pencil size={15} /></button><button className="danger" onClick={() => deleteLink(edge.id)} aria-label="Delete relationship"><Trash2 size={15} /></button></div>
        </div>)}
        {!graph.edges.length && <div className="column-empty">No relationships yet. Add two entities, then create a relationship from the left panel.</div>}
      </div>
      {!!isolatedNodes.length && <div className="isolated-section"><div className="sidebar-label">Unlinked entities <span>{isolatedNodes.length}</span></div><div className="isolated-grid">{isolatedNodes.map((node) => { const sense = senses.get(node.senseId); return <article key={node.id}><span className={`pos pos-${sense?.pos ?? 'n'}`}>{sense ? posLabel[sense.pos][0] : '?'}</span><div><strong>{sense?.lemma ?? 'Missing sense'}</strong><small>{sense?.definition}</small></div><button onClick={() => setEntityEditor(node.id)} aria-label={`Edit ${sense?.lemma}`}><Pencil size={15} /></button><button onClick={() => deleteEntity(node.id)} aria-label={`Delete ${sense?.lemma}`}><Trash2 size={15} /></button></article> })}</div></div>}
    </section>}

    {entityEditor && <div className="modal-backdrop"><div className="modal-card" role="dialog" aria-label="Edit entity"><button className="modal-close" onClick={() => setEntityEditor(null)} aria-label="Close entity editor"><X /></button><div className="eyebrow">Entity</div><h2>Edit “{editingEntitySense?.lemma ?? 'missing sense'}”</h2><p>Choose a different WordNet sense while keeping its relationships, or delete this entity and all of its relationships.</p><SenseSearch initialQuery={editingEntitySense?.lemma ?? ''} onSelect={replaceEntity} placeholder="Find a replacement sense…" /><button className="delete-link-button" onClick={() => deleteEntity(entityEditor)}><Trash2 size={16} /> Delete entity</button></div></div>}
    {linkEditor && <div className="modal-backdrop"><div className="modal-card" role="dialog" aria-label={linkEditor.mode === 'edit' ? 'Edit semantic link' : 'Create semantic link'}><button className="modal-close" onClick={() => setLinkEditor(null)} aria-label="Close link editor"><X /></button><div className="eyebrow">Semantic glue</div><h2>{linkEditor.mode === 'edit' ? 'Edit this relationship' : 'How are these ideas connected?'}</h2><p>{linkEditor.mode === 'edit' ? `The current linking sense is “${editingSense?.lemma ?? 'unknown'}”. Choose a replacement or delete the relationship.` : 'Choose another precise sense to label this relationship.'}</p><SenseSearch initialQuery={linkEditor.mode === 'edit' ? editingSense?.lemma ?? '' : ''} onSelect={linkWith} placeholder="Search for a linking sense…" />{linkEditor.mode === 'edit' && <button className="delete-link-button" onClick={() => deleteLink(linkEditor.edgeId)}><Trash2 size={16} /> Delete relationship</button>}</div></div>}
  </div>
}
