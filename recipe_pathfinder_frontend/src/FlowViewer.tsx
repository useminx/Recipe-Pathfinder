import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  useNodesState,
  useEdgesState,
  ConnectionLineType
} from '@xyflow/react';
import { Maximize2, Minimize2 } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { PathfinderNode, PathfinderTree } from './types';
import { MaterialNodeComponent, RecipeNodeComponent } from './FlowNodes';
import './FlowViewer.css';
import type { LocalizationMap } from './materialLocalization';

const nodeTypes = {
  material: MaterialNodeComponent,
  recipe: RecipeNodeComponent,
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 250;
const nodeHeight = 120; // estimate

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction, nodesep: 40, ranksep: 80 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = { ...node };
    
    // We are shifting the dagre node position (anchor=center center) to the top left
    // so it matches the React Flow node anchor point (top left).
    newNode.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return newNode;
  });

  return { nodes: newNodes, edges };
};

// Depth-first traversal to flatten the tree into nodes and edges
const buildGraph = (
  root: PathfinderTree,
  localizationMap: LocalizationMap,
  onToggle: (id: string) => void,
  expandState: Record<string, boolean>,
  onCopySuccess: () => void,
) => {
  const rfNodes: any[] = [];
  const rfEdges: any[] = [];
  
  const traverse = (node: PathfinderNode, pathId: string, parentId?: string, isTarget: boolean = false) => {
    // Determine expand state for this node (default true)
    const expanded = expandState[pathId] !== false;

    // Add node
    rfNodes.push({
      id: pathId,
      type: node.node_type === 'material_need' ? 'material' : 'recipe',
      data: { node, isTarget, onToggle, expanded, localizationMap, onCopySuccess },
      position: { x: 0, y: 0 } // handled by dagre
    });

    // Add edge from parent to this node
    if (parentId) {
      rfEdges.push({
        id: `e-${parentId}-${pathId}`,
        source: parentId, // data flows parent->child in tree? Wait.
        // visually: we want TB layout. Root is at top.
        // So visually parent is SOURCE, child is TARGET.
        target: pathId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 2 }
      });
    }

    // Process children IF this node is expanded AND has children
    if (expanded && node.children && node.children.length > 0) {
      node.children.forEach((child, index) => {
        traverse(child, `${pathId}-${index}`, pathId, false);
      });
    }
  };

  // Setup the "root" level connecting to the target object
  const rootId = 'root';
  if (root.children) {
    root.children.forEach((child, index) => {
      traverse(child, `${rootId}-${index}`, undefined, true);
    });
  }

  return { initialNodes: rfNodes, initialEdges: rfEdges };
};

interface FlowViewerProps {
  tree: PathfinderTree;
  localizationMap: LocalizationMap;
  onCopySuccess: () => void;
}

const FlowViewer = ({ tree, localizationMap, onCopySuccess }: FlowViewerProps) => {
  const [expandState, setExpandState] = useState<Record<string, boolean>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);

  const onToggle = useCallback((nodeId: string) => {
    setExpandState(prev => ({ ...prev, [nodeId]: prev[nodeId] === false }));
  }, []);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    const { initialNodes, initialEdges } = buildGraph(tree, localizationMap, onToggle, expandState, onCopySuccess);
    return getLayoutedElements(initialNodes, initialEdges, 'TB');
  }, [tree, localizationMap, expandState, onToggle, onCopySuccess]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Sync layout changes when dependencies update
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  return (
    <div className={`flow-viewer-container ${isFullscreen ? 'fullscreen' : ''}`}>
      <button 
        className="fullscreen-toggle" 
        onClick={() => setIsFullscreen(!isFullscreen)}
        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        minZoom={0.1}
        maxZoom={4}
        nodesDraggable={true}
        attributionPosition="bottom-right"
      >
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default FlowViewer;
