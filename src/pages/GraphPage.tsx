import { useCallback, useMemo, useState } from 'react'
import { Background, ConnectionMode, Controls, Handle, MiniMap, Position, ReactFlow, applyEdgeChanges, applyNodeChanges, reconnectEdge, type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronDown, CirclePlus, Network, Plus, Trash2, X } from 'lucide-react'
import { SensePill } from '../components/SensePill'
import { SenseSearch } from '../components/SenseSearch'
import { useWorkspace } from '../context/WorkspaceContext'
import type { ConceptEdge, GraphDocument, Sense, StoredSense } from '../types'

type SemanticNode = Node<{ sense?: StoredSense }, 'semantic'>
type LinkEditor = { mode: 'create'; connection: Connection } | { mode: 'edit'; edgeId: string }

function SemanticNodeCard({ data, selected }: NodeProps<SemanticNode>) {
  const sense = data.sense
  return <div className={`graph-node ${selected ? 'selected' : ''}`}>
    <Handle type="target" position={Position.Left} aria-label={`Drag a connection to ${sense?.lemma ?? 'node'}`} />
    <span>{sense?.lemma ?? 'Missing sense'}</span><small>{sense?.definition}</small>
    <Handle type="source" position={Position.Right} aria-label={`Drag a connection from ${sense?.lemma ?? 'node'}`} />
  </div>
}

const nodeTypes = { semantic: SemanticNodeCard }

export function GraphPage() {
  const { state, setState, addSense, createGraph, deleteGraph, updateGraph } = useWorkspace()
  const graph = state.graphs.find((item) => item.id === state.activeGraphId) ?? state.graphs[0]
  const [linkEditor, setLinkEditor] = useState<LinkEditor | null>(null)
  const [formSource, setFormSource] = useState('')
  const [formTarget, setFormTarget] = useState('')
  const compactCanvas = window.matchMedia('(max-width: 620px)').matches
  const senses = useMemo(() => new Map(state.senses.map((sense) => [sense.wordId, sense])), [state.senses])
  const nodes: SemanticNode[] = graph.nodes.map((node) => {
    const sense = senses.get(node.senseId)
    return { id: node.id, type: 'semantic', position: node.position, data: { sense }, className: `flow-node pos-${sense?.pos ?? 'n'}` }
  })
  const edges: Edge[] = graph.edges.map((edge) => {
    const linker = senses.get(edge.linkerSenseId)
    return { id: edge.id, source: edge.source, target: edge.target, label: linker?.lemma ?? 'relates to', className: 'semantic-edge', animated: true, reconnectable: true, interactionWidth: 28 }
  })

  const persist = useCallback((next: Partial<GraphDocument>) => updateGraph({ ...graph, ...next }), [graph, updateGraph])
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const persistentChanges = changes.filter((change) => change.type === 'position' || change.type === 'remove')
    if (!persistentChanges.length) return
    const changed = applyNodeChanges(persistentChanges, nodes)
    const remainingIds = new Set(changed.map((node) => node.id))
    persist({
      nodes: changed.map((node) => ({ id: node.id, senseId: graph.nodes.find((item) => item.id === node.id)?.senseId ?? '', position: node.position })),
      edges: graph.edges.filter((edge) => remainingIds.has(edge.source) && remainingIds.has(edge.target)),
    })
  }, [nodes, graph.nodes, graph.edges, persist])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const persistentChanges = changes.filter((change) => change.type === 'remove')
    if (!persistentChanges.length) return
    const changed = applyEdgeChanges(persistentChanges, edges)
    persist({ edges: changed.map((edge) => graph.edges.find((item) => item.id === edge.id)!).filter(Boolean) })
  }, [edges, graph.edges, persist])

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

  const editingSense = linkEditor?.mode === 'edit' ? senses.get(graph.edges.find((edge) => edge.id === linkEditor.edgeId)?.linkerSenseId ?? '') : undefined
  const nodeLabel = (nodeId: string) => senses.get(graph.nodes.find((node) => node.id === nodeId)?.senseId ?? '')?.lemma ?? 'Missing sense'

  return <div className="graph-page">
    <aside className="graph-sidebar">
      <div className="sidebar-top"><div className="eyebrow"><Network size={14} /> Composer</div><h1>Concept graph</h1></div>
      <div className="graph-select-row">
        <div className="select-wrap"><select value={graph.id} onChange={(event) => setState((current) => ({ ...current, activeGraphId: event.target.value }))}>{state.graphs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={15} /></div>
        <button className="icon-button" onClick={createGraph} aria-label="New graph"><Plus size={18} /></button>
        <button className="icon-button danger" onClick={() => deleteGraph(graph.id)} disabled={state.graphs.length === 1} aria-label="Delete graph"><Trash2 size={17} /></button>
      </div>
      <input className="graph-name" value={graph.name} onChange={(event) => persist({ name: event.target.value })} aria-label="Graph name" />
      <div className="graph-link-builder">
        <div className="sidebar-label">Create a link</div>
        <div className="graph-link-fields">
          <select aria-label="Link source" value={formSource} onChange={(event) => setFormSource(event.target.value)}><option value="">From…</option>{graph.nodes.map((node) => <option key={node.id} value={node.id}>{nodeLabel(node.id)}</option>)}</select>
          <span aria-hidden="true">→</span>
          <select aria-label="Link target" value={formTarget} onChange={(event) => setFormTarget(event.target.value)}><option value="">To…</option>{graph.nodes.map((node) => <option key={node.id} value={node.id}>{nodeLabel(node.id)}</option>)}</select>
          <button className="primary-button" disabled={!formSource || !formTarget || formSource === formTarget} onClick={() => setLinkEditor({ mode: 'create', connection: { source: formSource, target: formTarget, sourceHandle: null, targetHandle: null } })}>Link</button>
        </div>
        {!!graph.edges.length && <div className="graph-link-list">{graph.edges.map((edge) => <button key={edge.id} onClick={() => setLinkEditor({ mode: 'edit', edgeId: edge.id })} aria-label={`Edit link from ${nodeLabel(edge.source)} to ${nodeLabel(edge.target)}`}><span>{nodeLabel(edge.source)} <b>{senses.get(edge.linkerSenseId)?.lemma ?? 'relates to'}</b> {nodeLabel(edge.target)}</span><small>Edit</small></button>)}</div>}
      </div>
      <div className="sidebar-label">Sense palette <span>{state.senses.length}</span></div>
      <div className="node-palette">
        {state.senses.map((sense) => <SensePill key={sense.wordId} sense={sense} onClick={() => addNode(sense.wordId)} />)}
        {!state.senses.length && <p className="muted">Collect senses in the Sense lab, then return here to compose them.</p>}
      </div>
      <div className="sidebar-search"><SenseSearch compact onSelect={(sense) => { addSense(sense); addNode(sense.wordId) }} placeholder="Find another sense…" /></div>
    </aside>
    <section className="graph-canvas">
      <div className="canvas-hint"><CirclePlus size={15} /> Drag right → left or use “Create a link”; select Edit to change its meaning.</div>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={(connection) => setLinkEditor({ mode: 'create', connection })} onReconnect={onReconnect} onEdgeDoubleClick={(_, edge) => setLinkEditor({ mode: 'edit', edgeId: edge.id })} connectionMode={ConnectionMode.Strict} edgesReconnectable fitView fitViewOptions={{ minZoom: compactCanvas ? 1 : 0.1, maxZoom: 1 }} minZoom={compactCanvas ? 0.75 : 0.5} deleteKeyCode={['Backspace', 'Delete']}>
        <Background gap={24} size={1} /><Controls /><MiniMap pannable zoomable nodeStrokeWidth={3} />
      </ReactFlow>
    </section>
    {linkEditor && <div className="modal-backdrop"><div className="modal-card" role="dialog" aria-label={linkEditor.mode === 'edit' ? 'Edit semantic link' : 'Create semantic link'}><button className="modal-close" onClick={() => setLinkEditor(null)} aria-label="Close link editor"><X /></button><div className="eyebrow">Semantic glue</div><h2>{linkEditor.mode === 'edit' ? 'Edit this relationship' : 'How are these ideas connected?'}</h2><p>{linkEditor.mode === 'edit' ? `The current linking sense is “${editingSense?.lemma ?? 'unknown'}”. Choose a replacement.` : 'Choose another precise sense to label this relationship.'}</p><SenseSearch initialQuery={linkEditor.mode === 'edit' ? editingSense?.lemma ?? '' : ''} onSelect={linkWith} placeholder="Search for a linking sense…" /></div></div>}
  </div>
}
