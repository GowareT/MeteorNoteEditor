import type { CSSProperties } from "react";
import { RotateCw, Undo2, Menu, BookOpen, MessagesSquare, CircleCheck, ChevronsLeft, ChevronsRight, ChevronDown, ChevronLeft, ChevronRight, Settings, Cpu, FileText, Ellipsis, Folder, House, Lightbulb, Search, Minus, Send, SquarePen, Image, Pin, Plus, List, PanelsTopLeft, Server, Share2, PanelLeft, PanelRight, Sparkles, LayoutGrid, Trash2, Columns2, X } from "lucide-react";

const ICONS = {
  "arrow-path": RotateCw, "arrow-uturn-left": Undo2, "bars-3": Menu,
  "book-open": BookOpen, "chat-bubble-left-right": MessagesSquare,
  "check-circle": CircleCheck, "chevron-double-left": ChevronsLeft,
  "chevron-double-right": ChevronsRight, "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft, "chevron-right": ChevronRight,
  "cog-6-tooth": Settings, "cpu-chip": Cpu, "document-text": FileText,
  "ellipsis-horizontal": Ellipsis, folder: Folder, home: House,
  "light-bulb": Lightbulb, "magnifying-glass": Search, minus: Minus,
  "paper-airplane": Send, "pencil-square": SquarePen, photo: Image,
  pin: Pin, plus: Plus, "queue-list": List, "rectangle-group": PanelsTopLeft,
  "server-stack": Server, share: Share2, "sidebar-left": PanelLeft,
  "sidebar-right": PanelRight, sparkles: Sparkles, "squares-2x2": LayoutGrid,
  trash: Trash2, "view-columns": Columns2, "x-mark": X,
} as const;

export type IconName = keyof typeof ICONS;
interface IconProps { name: IconName; size?: number; className?: string; style?: CSSProperties; title?: string; }

export function Icon({name, size = 16, className, style, title}: IconProps) {
  const Glyph = ICONS[name];
  return <span className={`mn-icon ${className ?? ""}`} style={{width:size, height:size, display:"inline-flex", alignItems:"center", justifyContent:"center", lineHeight:0, flexShrink:0, ...style}} role={title?"img":undefined} aria-label={title} aria-hidden={title?undefined:true}>
    <Glyph size={size} strokeWidth={1.8} />
  </span>;
}
