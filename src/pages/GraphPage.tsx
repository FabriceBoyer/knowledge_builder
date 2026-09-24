import { useCallback, useMemo, useState } from 'react'
import { Background, ConnectionMode, Controls, Handle, MiniMap, Position, ReactFlow, applyNodeChanges, reconnectEdge, type Connection, type Edge, type Node, type NodeChange, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowRight, ChevronDown, CirclePlus, Columns3, Network, Pencil, Plus, Share2, Trash2, X } from 'lucide-react'
import { SensePill } from '../components/SensePill'
import { SenseSearch } from '../components/SenseSearch'
import { useWorkspace } from '../context/WorkspaceContext'
import { posLabel } from '../lib/wordnet'
import type { ConceptEdge, GraphDocument, Sense, StoredSense } from '../types'

type SemanticNode = Node<{ sense?: StoredSense; onEdit: (id: string) => void; onDelete: (id: string) => void }, 'semantic'>
type LinkEditor = { mode: 'create'; connection: Connection } | { mode: 'edit'; edgeId: string }
type EditorView = 'canvas' | 'columns'

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

export function GraphPage() {
  const { state, setState, addSense, createGraph, deleteGraph, updateGraph } = useWorkspace()
  const graph = state.graphs.find((item) => item.id === state.activeGraphId) ?? state.graphs[0]
  const [view, setView] = useState<EditorView>(() => window.matchMedia('(max-width: 620px)').matches ? 'columns' : 'canvas')
  const [linkEditor, setLinkEditor] = useState<LinkEditor | null>(null)
  const [entityEditor, setEntityEditor] = useState<string | null>(null)
  const [formSource, setFormSource] = useState('')
  const [formTarget, setFormTarget] = useState('')
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
    return { id: node.id, type: 'semantic', position: node.position, data: { sense, onEdit: setEntityEditor, onDelete: deleteEntity }, className: `flow-node pos-${sense?.pos ?? 'n'}` }
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
      <div className="graph-link-builder">
        <div className="sidebar-label">Create a relationship</div>
        <div className="graph-link-fields">
          <select aria-label="Link source" value={formSource} onChange={(event) => setFormSource(event.target.value)}><option value="">From…</option>{graph.nodes.map((node) => <option key={node.id} value={node.id}>{nodeLabel(node.id)}</option>)}</select>
          <span aria-hidden="true">→</span>
          <select aria-label="Link target" value={formTarget} onChange={(event) => setFormTarget(event.target.value)}><option value="">To…</option>{graph.nodes.map((node) => <option key={node.id} value={node.id}>{nodeLabel(node.id)}</option>)}</select>
          <button className="primary-button" disabled={!formSource || !formTarget || formSource === formTarget} onClick={() => setLinkEditor({ mode: 'create', connection: { source: formSource, target: formTarget, sourceHandle: null, targetHandle: null } })}>Link</button>
        </div>
      </div>
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
