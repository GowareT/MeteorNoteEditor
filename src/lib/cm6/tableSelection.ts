export type CellPosition = {row: number; col: number};
export type CellRange = {top: number; bottom: number; left: number; right: number};
type CellSpan = CellPosition & {rowSpan: number; colSpan: number};

/** Expand to include whole merged cells, including merges touched by expansion. */
export function tableCellRange(anchor: CellPosition, head: CellPosition, cells: CellSpan[]): CellRange {
  const range = {
    top: Math.min(anchor.row, head.row), bottom: Math.max(anchor.row, head.row),
    left: Math.min(anchor.col, head.col), right: Math.max(anchor.col, head.col),
  };
  let changed: boolean;
  do {
    changed = false;
    for (const cell of cells) {
      const bottom = cell.row + cell.rowSpan - 1, right = cell.col + cell.colSpan - 1;
      if (cell.row > range.bottom || bottom < range.top || cell.col > range.right || right < range.left) continue;
      const next = {top: Math.min(range.top, cell.row), bottom: Math.max(range.bottom, bottom),
        left: Math.min(range.left, cell.col), right: Math.max(range.right, right)};
      if (next.top !== range.top || next.bottom !== range.bottom || next.left !== range.left || next.right !== range.right) {
        Object.assign(range, next);
        changed = true;
      }
    }
  } while (changed);
  return range;
}

export function cellInRange(cell: CellPosition, range: CellRange) {
  return cell.row >= range.top && cell.row <= range.bottom && cell.col >= range.left && cell.col <= range.right;
}
