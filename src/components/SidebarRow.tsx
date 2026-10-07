import type {
  CSSProperties,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
} from "react";
import clsx from "clsx";
import "./SidebarRow.css";

interface SidebarRowProps {
  title: string;
  icon: ReactNode;
  selected?: boolean;
  indent?: number;
  compact?: boolean;
  badge?: number | null;
  className?: string;
  onClick?: () => void;
  onDoubleClick?: MouseEventHandler<HTMLButtonElement>;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  treeDndTarget?: {
    kind: "note" | "notebook";
    path: string;
    title: string;
    notebookPath?: string;
    parentPath?: string | null;
  };
  trailing?: ReactNode;
}

export function SidebarRow({
  title,
  icon,
  selected,
  indent = 0,
  compact,
  badge,
  className,
  onClick,
  onDoubleClick,
  onContextMenu,
  onPointerDown,
  treeDndTarget,
  trailing,
}: SidebarRowProps) {
  return (
    <button
      type="button"
      className={clsx(
        "mn-sidebar-row",
        selected && "is-selected",
        compact && "is-compact",
        !title && "is-icon-only",
        className,
      )}
      style={{ "--indent": `${indent}px` } as CSSProperties}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      data-mn-tree-target={treeDndTarget ? "true" : undefined}
      data-tree-kind={treeDndTarget?.kind}
      data-tree-path={treeDndTarget?.path}
      data-tree-title={treeDndTarget?.title}
      data-tree-notebook-path={treeDndTarget?.notebookPath}
      data-tree-parent-path={treeDndTarget?.parentPath ?? undefined}
      title={title || undefined}
    >
      <span className="mn-sidebar-row__icon">{icon}</span>
      {title ? <span className="mn-sidebar-row__title">{title}</span> : null}
      {badge != null && badge > 0 ? (
        <span className="mn-sidebar-row__badge">{badge}</span>
      ) : null}
      {trailing}
    </button>
  );
}

export function SidebarSection({ title }: { title: string }) {
  return <div className="mn-sidebar-section">{title}</div>;
}
