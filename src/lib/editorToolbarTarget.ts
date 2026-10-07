import type { FormatCommand, FormatMarks } from "@/lib/cm6/mdFormat";

export const EDITOR_FORMAT_CHANGED_EVENT = "mn-editor-format-changed";

export type EditorToolbarTarget = {
  applyFormat: (command: FormatCommand) => void;
  insertImage: (src: string, notePath?: string | null) => Promise<void> | void;
  insertCallout: (color?: string) => void;
  getFormatMarks: () => FormatMarks;
};

let activeToolbarTarget: EditorToolbarTarget | null = null;

export function setActiveEditorToolbarTarget(target: EditorToolbarTarget | null) {
  activeToolbarTarget = target;
}

export function getActiveEditorToolbarTarget() {
  return activeToolbarTarget;
}

export function clearActiveEditorToolbarTarget(target: EditorToolbarTarget) {
  if (activeToolbarTarget === target) activeToolbarTarget = null;
}

export function emitEditorFormatChanged(marks: FormatMarks) {
  window.dispatchEvent(
    new CustomEvent<FormatMarks>(EDITOR_FORMAT_CHANGED_EVENT, { detail: marks }),
  );
}
