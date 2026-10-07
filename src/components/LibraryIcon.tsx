import type { CSSProperties } from "react";
import {
  getLibraryIconDef,
  type LibraryIconId,
} from "@/lib/libraryIcons";
import "./LibraryIcon.css";

export function LibraryIcon({
  id,
  size = 16,
  className,
  title,
  style,
  fallback = "document",
}: {
  id: string | null | undefined;
  size?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
  fallback?: LibraryIconId;
}) {
  const isExternalSrc =
    !!id && /^(data:|blob:|https?:|file:)/.test(id) && !id.includes("<svg");
  if (isExternalSrc) {
    return (
      <img
        className={`mn-lib-icon mn-lib-icon--image ${className ?? ""}`}
        src={id}
        alt=""
        title={title ?? ""}
        aria-hidden={title ? undefined : true}
        style={{ width: size, height: size, ...style }}
      />
    );
  }
  const def = getLibraryIconDef(id, fallback);
  return (
    <span
      className={`mn-lib-icon ${className ?? ""}`}
      style={{ width: size, height: size, ...style }}
      title={title ?? def.label}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: def.svg }}
    />
  );
}
