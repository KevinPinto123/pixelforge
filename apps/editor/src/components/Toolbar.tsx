import { PixelToolIcon, type PixelToolIconName } from './PixelToolIcon.js';

export type ToolId = 'pencil' | 'eraser' | 'bucket' | 'line' | 'rect' | 'eyedropper';

export const TOOL_LABELS: Record<ToolId, string> = {
  pencil: 'Lápiz',
  eraser: 'Borrador',
  bucket: 'Relleno',
  line: 'Línea',
  rect: 'Rectángulo',
  eyedropper: 'Cuentagotas',
};

export interface ToolDef {
  id: ToolId;
  key: string;
  icon: PixelToolIconName;
  title: string;
}

/** Registro de tools (UX §3): la toolbar se genera de aca; agregar tool no toca layout. */
export const TOOLS: ToolDef[] = [
  { id: 'pencil', key: 'B', icon: 'brush', title: 'Lápiz (B)' },
  { id: 'eraser', key: 'E', icon: 'eraser', title: 'Borrador (E)' },
  { id: 'bucket', key: 'G', icon: 'bucket', title: 'Relleno (G)' },
  { id: 'line', key: 'L', icon: 'line', title: 'Línea (L)' },
  { id: 'rect', key: 'U', icon: 'rect', title: 'Rectángulo (U)' },
  { id: 'eyedropper', key: 'I', icon: 'eyedropper', title: 'Cuentagotas (I, Alt temporal)' },
];

export interface ToolbarProps {
  tool: ToolId;
  onTool: (tool: ToolId) => void;
  mirrorH: boolean;
  mirrorV: boolean;
  onMirrorH: () => void;
  onMirrorV: () => void;
}

export function Toolbar({ tool, onTool, mirrorH, mirrorV, onMirrorH, onMirrorV }: ToolbarProps) {
  return (
    <nav className="toolbar" aria-label="Herramientas">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? 'active' : ''}
          title={t.title}
          onClick={() => onTool(t.id)}
        >
          <PixelToolIcon name={t.icon} />
          <kbd>{t.key}</kbd>
        </button>
      ))}
      <div className="sep" />
      <button
        type="button"
        className={mirrorH ? 'toggled' : ''}
        title="Espejo H (Shift+H)"
        onClick={onMirrorH}
      >
        <PixelToolIcon name="mirror-h" /><kbd>H</kbd>
      </button>
      <button
        type="button"
        className={mirrorV ? 'toggled' : ''}
        title="Espejo V (Shift+V)"
        onClick={onMirrorV}
      >
        <PixelToolIcon name="mirror-v" /><kbd>V</kbd>
      </button>
    </nav>
  );
}
