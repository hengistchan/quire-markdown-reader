import { Check, ChevronDown, ChevronRight, File, Folder } from 'lucide-react';
import type { WorkspaceFile, WorkspaceTreeNode } from '../../../shared/types';

export function WorkspaceTree({ nodes, activeId, collapsed, onToggle, onOpen }: {
  nodes: WorkspaceTreeNode[];
  activeId?: string;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (file: WorkspaceFile) => void;
}) {
  return <>{nodes.map((node) => node.kind === 'directory' ? (
    <div key={node.id} className="tree-group">
      <button className="folder-row" style={{ paddingInlineStart: `${12 + node.depth * 13}px` }} onClick={() => onToggle(node.path)}>
        {collapsed.has(node.path) ? <ChevronRight /> : <ChevronDown />}<Folder /><span>{node.name}</span>
      </button>
      {!collapsed.has(node.path) && <WorkspaceTree nodes={node.children} activeId={activeId} collapsed={collapsed} onToggle={onToggle} onOpen={onOpen} />}
    </div>
  ) : (
    <button key={node.id} className={`file-row ${activeId === node.id ? 'active' : ''}`} style={{ paddingInlineStart: `${18 + node.depth * 13}px` }} onClick={() => onOpen(node.file)}>
      <File /><span>{node.name}</span>{activeId === node.id && <Check className="row-check" />}
    </button>
  ))}</>;
}
