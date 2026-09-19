import { useCallback, useMemo, useState } from 'react'
import { Background, Controls, MiniMap, ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type EdgeChange, type Node, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronDown, CirclePlus, Network, Plus, Trash2, X } from 'lucide-react'
import { SensePill } from '../components/SensePill'
import { SenseSearch } from '../components/SenseSearch'
import { useWorkspace } from '../context/WorkspaceContext'
import type { ConceptEdge, GraphDocument, Sense } from '../types'

export function GraphPage() {
  const { state, setState, addSense, createGraph, deleteGraph, updateGraph } = useWorkspace()
  const graph = state.graphs.find((item) => item.id === state.activeGraphId) ?? state.graphs[0]
  const [pending, setPending] = useState<Connection | null>(null)
  const senses = useMemo(() => new Map(state.senses.map((sense) => [sense.wordId, sense])), [state.senses])
  const nodes: Node[] = graph.nodes.map((node) => {
    const sense = senses.get(node.senseId)
    return { id: node.id, position: node.position, data: { label: <div className="graph-node"><span>{sense?.lemma ?? 'Missing sense'}</span><small>{sense?.definition}</small></div> }, className: `flow-node pos-${sense?.pos ?? 'n'}` }
  })
  const edges: Edge[] = graph.edges.map((edge) => {
    const linker = senses.get(edge.linkerSenseId)
    return { id: edge.id, source: edge.source, target: edge.target, label: linker?.lemma ?? 'relates to', className: 'semantic-edge', animated: true }
  })

  const persist = useCallback((next: Partial<GraphDocument>) => updateGraph({ ...graph, ...next }), [graph, updateGraph])
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const changed = applyNodeChanges(changes, nodes)
    persist({ nodes: changed.map((node) => ({ id: node.id, senseId: graph.nodes.find((item) => item.id === node.id)?.senseId ?? '', position: node.position })) })
  }, [nodes, graph.nodes, persist])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const changed = applyEdgeChanges(changes, edges)
    persist({ edges: changed.map((edge) => graph.edges.find((item) => item.id === edge.id)!).filter(Boolean) })
  }, [edges, graph.edges, persist])

  function addNode(senseId: string) {
    if (graph.nodes.some((node) => node.senseId === senseId)) return
    persist({ nodes: [...graph.nodes, { id: crypto.randomUUID(), senseId, position: { x: 100 + (graph.nodes.length % 3) * 240, y: 80 + Math.floor(graph.nodes.length / 3) * 150 } }] })
  }

  function linkWith(sense: Sense) {
    addSense(sense)
    if (!pending?.source || !pending.target) return
    const semantic: ConceptEdge = { id: crypto.randomUUID(), source: pending.source, target: pending.target, linkerSenseId: sense.wordId }
    const rendered = addEdge({ id: semantic.id, source: semantic.source, target: semantic.target }, edges)
    if (rendered.length) persist({ edges: [...graph.edges, semantic] })
    setPending(null)
  }

  return <div className="graph-page">
    <aside className="graph-sidebar">
      <div className="sidebar-top"><div className="eyebrow"><Network size={14} /> Composer</div><h1>Concept graph</h1></div>
      <div className="graph-select-row">
        <div className="select-wrap"><select value={graph.id} onChange={(event) => setState((current) => ({ ...current, activeGraphId: event.target.value }))}>{state.graphs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={15} /></div>
        <button className="icon-button" onClick={createGraph} aria-label="New graph"><Plus size={18} /></button>
        <button className="icon-button danger" onClick={() => deleteGraph(graph.id)} disabled={state.graphs.length === 1} aria-label="Delete graph"><Trash2 size={17} /></button>
      </div>
      <input className="graph-name" value={graph.name} onChange={(event) => persist({ name: event.target.value })} aria-label="Graph name" />
      <div className="sidebar-label">Sense palette <span>{state.senses.length}</span></div>
      <div className="node-palette">
        {state.senses.map((sense) => <SensePill key={sense.wordId} sense={sense} onClick={() => addNode(sense.wordId)} />)}
        {!state.senses.length && <p className="muted">Collect senses in the Sense lab, then return here to compose them.</p>}
      </div>
      <div className="sidebar-search"><SenseSearch compact onSelect={(sense) => { addSense(sense); addNode(sense.wordId) }} placeholder="Find another sense…" /></div>
    </aside>
    <section className="graph-canvas">
      <div className="canvas-hint"><CirclePlus size={15} /> Click a palette sense to add it. Drag between handles to connect.</div>
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={setPending} fitView deleteKeyCode={['Backspace', 'Delete']}>
        <Background gap={24} size={1} /><Controls /><MiniMap pannable zoomable nodeStrokeWidth={3} />
      </ReactFlow>
    </section>
    {pending && <div className="modal-backdrop"><div className="modal-card"><button className="modal-close" onClick={() => setPending(null)}><X /></button><div className="eyebrow">Semantic glue</div><h2>How are these ideas connected?</h2><p>Choose another precise sense to label this relationship.</p><SenseSearch onSelect={linkWith} placeholder="Search for a linking sense…" /></div></div>}
  </div>
}
