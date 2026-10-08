import { t } from "@/lib/i18n";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { openImageInsertDialog } from "@/lib/editorImages";
import { Icon } from "@/components/Icon";
import {
  type FormatMarks,
  type FormatCommand,
  type TextAlign,
} from "@/lib/cm6/mdFormat";
import {
  EDITOR_FORMAT_CHANGED_EVENT,
  type EditorToolbarTarget,
} from "@/lib/editorToolbarTarget";
import { List, ListOrdered } from "lucide-react";
import "./NoteEditorToolbar.css";

const COLORS = [
  "#1d1d1f",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#007aff",
  "#5856d6",
  "#af52de",
];

const HIGHLIGHT_COLORS = [
  "#fff2a8",
  "#ffe1a6",
  "#ffd3d3",
  "#dff4c7",
  "#dbe8ff",
  "#eadcff",
  "#ffd8f0",
  "#cdeee7",
];

const MORE_BTN_RESERVE = 78;
const TOOLS_GAP = 2;

type Props = {
  getEditor: () => EditorToolbarTarget | null;
  notePath?: string | null;
  disabled?: boolean;
  historyOpen?: boolean;
  onOpenHistory?: () => void;
  onHide?: () => void;
  trailing?: ReactNode;
};

function ToolBtn({
  title,
  active,
  disabled,
  onClick,
  children,
  className = "",
  expanded,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      className={`mn-md-tb__btn${active ? " is-active" : ""} ${className}`.trim()}
      title={title}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      aria-expanded={expanded}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mn-md-tb__sep" aria-hidden />;
}

type ToolId =
  | "insert"
  | "sep-fmt"
  | "bold"
  | "heading"
  | "italic"
  | "underline"
  | "strike"
  | "highlight"
  | "color"
  | "align"
  | "sep-list"
  | "todo"
  | "callout"
  | "ul"
  | "ol"
  | "sep-hist"
  | "history"
  | "hide";

type ToolDef =
  | { id: ToolId; kind: "sep" }
  | {
      id: ToolId;
      kind: "btn";
      title: string;
      label?: string;
      render: () => ReactNode;
      onClick: () => void;
      active?: boolean;
      disabled?: boolean;
    }
  | {
      id: ToolId;
      kind: "menu";
      title: string;
      label: string;
      open: boolean;
      setOpen: (v: boolean) => void;
      menuRef: RefObject<HTMLDivElement | null>;
      trigger: ReactNode;
      panel: ReactNode;
      overflowItems: { key: string; label: string; onClick: () => void }[];
    };

export function NoteEditorToolbar({
  getEditor,
  notePath,
  disabled = false,
  historyOpen = false,
  onOpenHistory,
  onHide,
  trailing,
}: Props) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const headingOptions = [
    { level: 1, label: t("一级标题") },
    { level: 2, label: t("二级标题") },
    { level: 3, label: t("三级标题") },
    { level: 0, label: t("正文") },
  ] as const;
  const [insertOpen, setInsertOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [formatMarks, setFormatMarks] = useState<FormatMarks>({});
  const [visibleCount, setVisibleCount] = useState(99);
  const [morePos, setMorePos] = useState<{ top: number; right: number } | null>(
    null,
  );

  const insertRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const alignRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const morePopRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setFormatMarks(getEditor()?.getFormatMarks() ?? {});
    const onFormatChanged = (event: Event) => {
      setFormatMarks((event as CustomEvent<FormatMarks>).detail ?? {});
    };
    sync();
    window.addEventListener(EDITOR_FORMAT_CHANGED_EVENT, onFormatChanged);
    window.addEventListener("selectionchange", sync);
    return () => {
      window.removeEventListener(EDITOR_FORMAT_CHANGED_EVENT, onFormatChanged);
      window.removeEventListener("selectionchange", sync);
    };
  }, [getEditor]);

  const run = (cmd: FormatCommand) => {
    const editor = getEditor();
    if (!editor || disabled) return;
    editor.applyFormat(cmd);
  };

  const insertImageFromPath = async (src: string) => {
    const editor = getEditor();
    if (!editor || disabled) return;
    await editor.insertImage(src, notePath);
  };

  const openImage = () => openImageInsertDialog(insertImageFromPath);

  const insertCallout = () => {
    const editor = getEditor();
    if (!editor || disabled) return;
    editor.insertCallout();
  };

  const setAlign = (align: TextAlign) => {
    setAlignOpen(false);
    setMoreOpen(false);
    run({ type: "align", align });
  };

  const closeMenus = () => {
    setHeadingOpen(false);
    setInsertOpen(false);
    setColorOpen(false);
    setHighlightOpen(false);
    setAlignOpen(false);
    setMoreOpen(false);
  };

  const tools: ToolDef[] = [
    {
      id: "insert",
      kind: "menu",
      title: t("插入"),
      label: t("插入"),
      open: insertOpen,
      setOpen: (v) => {
        setInsertOpen(v);
        if (v) {
          setHeadingOpen(false);
          setColorOpen(false);
          setHighlightOpen(false);
          setAlignOpen(false);
          setMoreOpen(false);
        }
      },
      menuRef: insertRef,
      trigger: (
        <>
          <Icon name="plus" size={13} />
          <span className="mn-md-tb__label">{t("插入")}</span>
          <Icon name="chevron-down" size={10} />
        </>
      ),
      panel: (
        <div className="mn-md-tb__pop">
          {(
            [
              ["link", t("链接")],
              ["image", t("图片…")],
              ["callout", t("高亮块")],
              ["code", t("代码块")],
              ["table", t("表格")],
              ["quote", t("引用")],
              ["hr", t("分割线")],
              ["math", t("行内公式")],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className="mn-md-tb__pop-item"
              onClick={() => {
                closeMenus();
                if (kind === "image") {
                  openImage();
                  return;
                }
                if (kind === "callout") {
                  insertCallout();
                  return;
                }
                run({
                  type: "insert",
                  kind: kind as
                    | "link"
                    | "image"
                    | "code"
                    | "table"
                    | "quote"
                    | "hr"
                    | "math",
                });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ),
      overflowItems: (
        [
          ["link", t("插入链接")],
          ["image", t("插入图片")],
          ["callout", t("插入高亮块")],
          ["code", t("插入代码块")],
          ["table", t("插入表格")],
          ["quote", t("插入引用")],
          ["hr", t("插入分割线")],
          ["math", t("插入行内公式")],
        ] as const
      ).map(([kind, label]) => ({
        key: `insert-${kind}`,
        label,
        onClick: () => {
          closeMenus();
          if (kind === "image") {
            openImage();
            return;
          }
          if (kind === "callout") {
            insertCallout();
            return;
          }
          run({
            type: "insert",
            kind: kind as
              | "link"
              | "image"
              | "code"
              | "table"
              | "quote"
              | "hr"
              | "math",
          });
        },
      })),
    },
    { id: "sep-fmt", kind: "sep" },
    {
      id: "heading",
      kind: "menu",
      title: t("标题"),
      label: t("标题"),
      open: headingOpen,
      setOpen: (open) => {
        closeMenus();
        setHeadingOpen(open);
      },
      menuRef: headingRef,
      trigger: <><span className="mn-md-tb__label">{t("标题")}</span><Icon name="chevron-down" size={10} /></>,
      panel: (
        <div className="mn-md-tb__pop" role="menu" aria-label={t("标题")}>
          {headingOptions.map(({ level, label }) => (
            <button
              key={level}
              type="button"
              role="menuitemradio"
              aria-checked={formatMarks.heading === level}
              className={`mn-md-tb__pop-item${formatMarks.heading === level ? " is-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                closeMenus();
                run({ type: "heading", level });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ),
      overflowItems: headingOptions.map(({ level, label }) => ({
        key: `heading-${level}`,
        label,
        onClick: () => {
          closeMenus();
          run({ type: "heading", level });
        },
      })),
    },
    {
      id: "bold",
      kind: "btn",
      title: t("加粗"),
      label: t("加粗"),
      disabled,
      active: Boolean(formatMarks.bold),
      onClick: () => run({ type: "bold" }),
      render: () => <strong className="mn-md-tb__glyph">B</strong>,
    },
    {
      id: "italic",
      kind: "btn",
      title: t("斜体"),
      label: t("斜体"),
      disabled,
      active: Boolean(formatMarks.italic),
      onClick: () => run({ type: "italic" }),
      render: () => <em className="mn-md-tb__glyph">I</em>,
    },
    {
      id: "underline",
      kind: "btn",
      title: t("下划线"),
      label: t("下划线"),
      disabled,
      active: Boolean(formatMarks.underline),
      onClick: () => run({ type: "underline" }),
      render: () => <span className="mn-md-tb__glyph is-u">U</span>,
    },
    {
      id: "strike",
      kind: "btn",
      title: t("删除线"),
      label: t("删除线"),
      disabled,
      active: Boolean(formatMarks.strike),
      onClick: () => run({ type: "strike" }),
      render: () => <span className="mn-md-tb__glyph is-s">S</span>,
    },
    {
      id: "highlight",
      kind: "menu",
      title: t("高亮"),
      label: t("高亮"),
      open: highlightOpen,
      setOpen: (v) => {
        setHighlightOpen(v);
        if (v) {
          setHeadingOpen(false);
          setInsertOpen(false);
          setColorOpen(false);
          setAlignOpen(false);
          setMoreOpen(false);
        }
      },
      menuRef: highlightRef,
      trigger: <span className="mn-md-tb__glyph is-mark">A</span>,
      panel: (
        <div className="mn-md-tb__pop mn-md-tb__pop--colors">
          <button
            type="button"
            className="mn-md-tb__swatch mn-md-tb__swatch--text"
            title={t("默认高亮")}
            onClick={() => {
              closeMenus();
              run({ type: "highlight" });
            }}
          >
            <span className="mn-md-tb__swatch-text">A</span>
          </button>
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="mn-md-tb__swatch"
              style={{ background: c }}
              title={c}
              onClick={() => {
                closeMenus();
                run({ type: "highlight", color: c });
              }}
            />
          ))}
          <label className="mn-md-tb__swatch mn-md-tb__swatch--picker" title={t("自定义高亮颜色")}>
            <input
              type="color"
              className="mn-md-tb__picker"
              defaultValue="#fff2a8"
              onChange={(e) => {
                closeMenus();
                run({ type: "highlight", color: e.target.value });
              }}
            />
          </label>
        </div>
      ),
      overflowItems: [],
    },
    {
      id: "color",
      kind: "menu",
      title: t("字体颜色"),
      label: t("字体颜色"),
      open: colorOpen,
      setOpen: (v) => {
        setColorOpen(v);
        if (v) {
          setHeadingOpen(false);
          setInsertOpen(false);
          setHighlightOpen(false);
          setAlignOpen(false);
          setMoreOpen(false);
        }
      },
      menuRef: colorRef,
      trigger: <span className="mn-md-tb__glyph is-color">A</span>,
      panel: (
        <div className="mn-md-tb__pop mn-md-tb__pop--colors">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="mn-md-tb__swatch"
              style={{ background: c }}
              title={c}
              onClick={() => {
                closeMenus();
                run({ type: "color", color: c });
              }}
            />
          ))}
          <label className="mn-md-tb__swatch mn-md-tb__swatch--picker" title={t("自定义字体颜色")}>
            <input
              type="color"
              className="mn-md-tb__picker"
              defaultValue="#000000"
              onChange={(e) => {
                closeMenus();
                run({ type: "color", color: e.target.value });
              }}
            />
          </label>
        </div>
      ),
      overflowItems: [],
    },
    {
      id: "align",
      kind: "menu",
      title: t("文字位置"),
      label: t("文字位置"),
      open: alignOpen,
      setOpen: (v) => {
        setAlignOpen(v);
        if (v) {
          setHeadingOpen(false);
          setInsertOpen(false);
          setColorOpen(false);
          setHighlightOpen(false);
          setMoreOpen(false);
        }
      },
      menuRef: alignRef,
      trigger: <Icon name="bars-3" size={13} />,
      panel: (
        <div className="mn-md-tb__pop">
          {(
            [
              ["left", t("左对齐")],
              ["center", t("居中")],
              ["right", t("右对齐")],
            ] as const
          ).map(([align, label]) => (
            <button
              key={align}
              type="button"
              className={`mn-md-tb__pop-item${formatMarks.align === align ? " is-active" : ""}`}
              onClick={() => setAlign(align)}
            >
              {label}
            </button>
          ))}
        </div>
      ),
      overflowItems: (
        [
          ["left", t("左对齐")],
          ["center", t("居中")],
          ["right", t("右对齐")],
        ] as const
      ).map(([align, label]) => ({
        key: `align-${align}`,
        label,
        onClick: () => setAlign(align),
      })),
    },
    { id: "sep-list", kind: "sep" },
    {
      id: "todo",
      kind: "btn",
      title: t("待办"),
      label: t("待办"),
      disabled,
      onClick: () => run({ type: "todo" }),
      render: () => <Icon name="check-circle" size={13} />,
    },
    {
      id: "callout",
      kind: "btn",
      title: t("高亮块"),
      label: t("高亮块"),
      disabled,
      onClick: insertCallout,
      render: () => <Icon name="light-bulb" size={13} />,
    },
    {
      id: "ul",
      kind: "btn",
      title: t("无序列表"),
      label: t("无序列表"),
      disabled,
      onClick: () => run({ type: "ul" }),
      render: () => <List size={15} strokeWidth={2} />,
    },
    {
      id: "ol",
      kind: "btn",
      title: t("有序列表"),
      label: t("有序列表"),
      disabled,
      onClick: () => run({ type: "ol" }),
      render: () => <ListOrdered size={15} strokeWidth={2} />,
    },
  ];

  if (onOpenHistory) {
    tools.push(
      { id: "sep-hist", kind: "sep" },
      {
        id: "history",
        kind: "btn",
        title: t("历史版本"),
        label: t("历史版本"),
        active: historyOpen,
        disabled: false,
        onClick: () => onOpenHistory(),
        render: () => (
          <>
            <Icon name="arrow-path" size={13} />
            <span className="mn-md-tb__label">{t("历史")}</span>
          </>
        ),
      },
    );
  }

  if (onHide) {
    tools.push({
      id: "hide",
      kind: "btn",
      title: t("隐藏工具栏"),
      label: t("隐藏工具栏"),
      disabled: false,
      onClick: () => onHide(),
      render: () => (
        <>
          <Icon name="chevron-left" size={12} />
          <span className="mn-md-tb__label">{t("隐藏")}</span>
        </>
      ),
    });
  }

  const toolCount = tools.length;

  const recomputeVisible = () => {
    const toolsEl = toolsRef.current;
    const measureEl = measureRef.current;
    if (!toolsEl || !measureEl) return;
    const kids = Array.from(measureEl.children) as HTMLElement[];
    if (!kids.length) return;

    // offsetWidth 比 getBoundingClientRect 更稳（离屏测量）
    const widths = kids.map((el) => {
      const child = el.firstElementChild as HTMLElement | null;
      return Math.ceil(child?.offsetWidth || el.offsetWidth || 0);
    });
    if (widths.some((w) => w <= 0)) {
      // 尚未完成布局，下一帧再量
      requestAnimationFrame(recomputeVisible);
      return;
    }

    const avail = toolsEl.clientWidth;
    if (avail <= 0) return;

    const total =
      widths.reduce((a, b) => a + b, 0) +
      Math.max(0, widths.length - 1) * TOOLS_GAP;

    if (total <= avail) {
      setVisibleCount(toolCount);
      return;
    }

    let used = 0;
    let count = 0;
    for (let i = 0; i < widths.length; i++) {
      const w = widths[i]!;
      const next = count === 0 ? w : used + TOOLS_GAP + w;
      if (next + TOOLS_GAP + MORE_BTN_RESERVE > avail) break;
      used = next;
      count += 1;
    }
    setVisibleCount(Math.max(1, Math.min(count, toolCount - 1)));
  };

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => recomputeVisible());
    const toolsEl = toolsRef.current;
    if (!toolsEl) return () => cancelAnimationFrame(id);
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(recomputeVisible);
    });
    ro.observe(toolsEl);
    window.addEventListener("resize", recomputeVisible);
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
      window.removeEventListener("resize", recomputeVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolCount, historyOpen, onOpenHistory, onHide]);

  useEffect(() => {
    if (!moreOpen || !moreBtnRef.current) {
      setMorePos(null);
      return;
    }
    const place = () => {
      const r = moreBtnRef.current?.getBoundingClientRect();
      if (!r) return;
      setMorePos({
        top: r.bottom + 4,
        right: Math.max(8, window.innerWidth - r.right),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!headingOpen && !insertOpen && !colorOpen && !highlightOpen && !alignOpen && !moreOpen)
      return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (headingOpen && !headingRef.current?.contains(t)) setHeadingOpen(false);
      if (insertOpen && !insertRef.current?.contains(t)) setInsertOpen(false);
      if (colorOpen && !colorRef.current?.contains(t)) setColorOpen(false);
      if (highlightOpen && !highlightRef.current?.contains(t))
        setHighlightOpen(false);
      if (alignOpen && !alignRef.current?.contains(t)) setAlignOpen(false);
      if (moreOpen) {
        const inBtn = moreBtnRef.current?.contains(t);
        const inPop = morePopRef.current?.contains(t);
        if (!inBtn && !inPop) setMoreOpen(false);
      }
    };
    // 延后绑定，避免打开当次点击立刻关掉
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", onDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", onDown);
    };
  }, [headingOpen, insertOpen, colorOpen, highlightOpen, alignOpen, moreOpen]);

  const visible = tools.slice(0, visibleCount);
  const overflow = tools.slice(visibleCount);
  const overflowClean = overflow.filter((t, i, arr) => {
    if (t.kind !== "sep") return true;
    if (i === 0) return false;
    if (arr[i - 1]?.kind === "sep") return false;
    if (i === arr.length - 1) return false;
    return true;
  });
  const hasMore = overflowClean.some((t) => t.kind !== "sep");

  const renderTool = (tool: ToolDef, keyPrefix: string) => {
    if (tool.kind === "sep") {
      return <Sep key={`${keyPrefix}-${tool.id}`} />;
    }
    if (tool.kind === "btn") {
      return (
        <ToolBtn
          key={`${keyPrefix}-${tool.id}`}
          title={tool.title}
          active={tool.active}
          disabled={tool.disabled}
          onClick={tool.onClick}
        >
          {tool.render()}
        </ToolBtn>
      );
    }
    return (
      <div
        key={`${keyPrefix}-${tool.id}`}
        className="mn-md-tb__menu"
        ref={tool.menuRef}
      >
        <ToolBtn
          title={tool.title}
          active={tool.open}
          expanded={tool.open}
          disabled={disabled}
          onClick={() => tool.setOpen(!tool.open)}
        >
          {tool.trigger}
        </ToolBtn>
        {tool.open ? tool.panel : null}
      </div>
    );
  };

  const moreMenu =
    moreOpen && morePos
      ? createPortal(
          <div
            ref={morePopRef}
            className="mn-md-tb__pop mn-md-tb__pop--more mn-md-tb__pop--portal"
            style={{ top: morePos.top, right: morePos.right }}
            role="menu"
          >
            {overflowClean.map((tool) => {
              if (tool.kind === "sep") {
                return (
                  <div key={`o-sep-${tool.id}`} className="mn-md-tb__pop-sep" />
                );
              }
              if (tool.kind === "btn") {
                return (
                  <button
                    key={`o-${tool.id}`}
                    type="button"
                    className={`mn-md-tb__pop-item${tool.active ? " is-active" : ""}`}
                    disabled={tool.disabled}
                    onClick={() => {
                      setMoreOpen(false);
                      tool.onClick();
                    }}
                  >
                    {tool.label ?? tool.title}
                  </button>
                );
              }
              if (tool.id === "color") {
                return (
                  <div key={`o-${tool.id}`} className="mn-md-tb__pop-block">
                    <div className="mn-md-tb__pop-label">{tool.label}</div>
                    <div className="mn-md-tb__pop--colors is-inline">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="mn-md-tb__swatch"
                          style={{ background: c }}
                          title={c}
                          onClick={() => {
                            closeMenus();
                            run({ type: "color", color: c });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <div key={`o-${tool.id}`} className="mn-md-tb__pop-block">
                  <div className="mn-md-tb__pop-label">{tool.label}</div>
                  {tool.overflowItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="mn-md-tb__pop-item"
                      onClick={item.onClick}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`mn-md-tb${disabled ? " is-disabled" : ""}`} role="toolbar">
      <div className="mn-md-tb__measure" ref={measureRef} aria-hidden>
        {tools.map((tool) => (
          <span key={`m-${tool.id}`} className="mn-md-tb__measure-item">
            {tool.kind === "sep" ? (
              <Sep />
            ) : tool.kind === "btn" ? (
              <span className="mn-md-tb__btn">
                {tool.render()}
              </span>
            ) : (
              <span className="mn-md-tb__btn">{tool.trigger}</span>
            )}
          </span>
        ))}
      </div>

      <div className="mn-md-tb__tools" ref={toolsRef}>
        {visible.map((tool) => renderTool(tool, "v"))}
        {hasMore ? (
          <button
            ref={moreBtnRef}
            type="button"
            className={`mn-md-tb__btn${moreOpen ? " is-active" : ""}`}
            title={t("更多")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setMoreOpen((v) => !v);
              setHeadingOpen(false);
              setInsertOpen(false);
              setColorOpen(false);
              setHighlightOpen(false);
              setAlignOpen(false);
            }}
          >
            <Icon name="ellipsis-horizontal" size={14} />
            <span className="mn-md-tb__label">{t("更多")}</span>
          </button>
        ) : null}
      </div>

      {trailing ? <div className="mn-md-tb__trail">{trailing}</div> : null}
      {moreMenu}
    </div>
  );
}

export function NoteEditorToolbarReveal({
  onShow,
  trailing,
}: {
  onShow: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="mn-md-tb mn-md-tb--reveal" role="toolbar">
      <div className="mn-md-tb__tools">
        <ToolBtn title={t("显示工具栏")} disabled={false} onClick={onShow}>
          <Icon name="bars-3" size={13} />
          <span className="mn-md-tb__label">{t("工具栏")}</span>
        </ToolBtn>
      </div>
      {trailing ? <div className="mn-md-tb__trail">{trailing}</div> : null}
    </div>
  );
}
