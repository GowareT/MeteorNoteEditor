import { useEffect, useRef, useState } from "react";
import "./ContextMenu.css";

export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  separator?: boolean;
  onSelect?: () => void;
  submenu?: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  anchorLeft?: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, anchorLeft, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [submenu, setSubmenu] = useState<{
    index: number;
    x: number;
    y: number;
    anchorLeft: number;
  } | null>(null);
  const submenuItems = submenu
    ? items[submenu.index]?.submenu ?? null
    : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (target instanceof Element && target.closest(".mn-context-menu")) {
        return;
      }
      if (!ref.current?.contains(target)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, anchorLeft === undefined ? window.innerWidth - rect.width - pad : anchorLeft - rect.width - 6);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, anchorLeft, items]);

  useEffect(() => {
    setSubmenu(null);
  }, [items]);

  const openSubmenu = (index: number) => {
    const el = itemRefs.current[index];
    const submenu = items[index]?.submenu;
    if (!el || items[index]?.disabled || !submenu?.length) {
      setSubmenu(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setSubmenu({
      index,
      x: rect.right + 6,
      y: rect.top - 4,
      anchorLeft: rect.left,
    });
  };

  return (
    <>
      <div
        ref={ref}
        className="mn-context-menu"
        style={{ left: x, top: y }}
        role="menu"
        data-no-window-drag
        onMouseDown={(e) => e.preventDefault()}
      >
        {items.map((item, index) =>
          item.separator ? (
            <div key={`sep-${index}`} className="mn-context-menu__sep" />
          ) : (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              className={`mn-context-menu__item${item.danger ? " is-danger" : ""}${
                item.checked ? " is-checked" : ""
              }${item.submenu?.length ? " has-submenu" : ""}`}
              disabled={item.disabled}
              onMouseEnter={() => {
                if (item.submenu?.length) openSubmenu(index);
                else setSubmenu(null);
              }}
              onFocus={() => {
                if (item.submenu?.length) openSubmenu(index);
                else setSubmenu(null);
              }}
              onClick={() => {
                if (item.disabled) return;
                if (item.submenu?.length) {
                  openSubmenu(index);
                  return;
                }
                onClose();
                // 延后执行，避免右键菜单关闭与原生对话框抢焦点
                window.setTimeout(() => item.onSelect?.(), 0);
              }}
            >
              <span className="mn-context-menu__check" aria-hidden>
                {item.checked ? "✓" : ""}
              </span>
              <span className="mn-context-menu__label">{item.label}</span>
              {item.submenu?.length ? (
                <span className="mn-context-menu__arrow" aria-hidden>
                  ›
                </span>
              ) : null}
            </button>
          ),
        )}
      </div>
      {submenuItems?.length && submenu ? (
        <ContextMenu
          x={submenu.x}
          y={submenu.y}
          anchorLeft={submenu.anchorLeft}
          items={submenuItems}
          onClose={onClose}
        />
      ) : null}
    </>
  );
}
