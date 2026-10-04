import { deserializeDoc, serializeDoc, type SpriteDoc } from './document.js';

const MAX_UNDO = 60;

/**
 * Undo/redo por snapshot serializado (Fase 1 tarea 11). Para lienzos pixel-art
 * (<=128x128 x pocas capas/frames) el snapshot completo es mas barato y mucho
 * mas robusto que comandos invertibles; si el profiling algun dia dice lo
 * contrario, el contrato (push/undo/redo) no cambia.
 */
export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  push(doc: SpriteDoc): void {
    this.undoStack.push(serializeDoc(doc));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(current: SpriteDoc): SpriteDoc | null {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return null;
    this.redoStack.push(serializeDoc(current));
    return deserializeDoc(snapshot, current.name);
  }

  redo(current: SpriteDoc): SpriteDoc | null {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return null;
    this.undoStack.push(serializeDoc(current));
    return deserializeDoc(snapshot, current.name);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
