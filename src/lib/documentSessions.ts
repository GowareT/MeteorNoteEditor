import { syncLeadingTitle } from "./noteTitle";

export type DocumentSession = { path: string; base: string; draft: string; error?: string; external?: string; saving: boolean };
export type PathChange = { from: string; to: string; kind: "note" | "notebook"; before?: string | null; after?: string | null };
type Transport = { read: (path: string) => Promise<string>; write: (path: string, content: string, expected: string) => Promise<void> };

/** One save queue per document; callers never write a stale captured draft. */
export class DocumentSessions {
  readonly documents = new Map<string, DocumentSession>();
  private queues = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private version = 0;
  constructor(private transport: Transport, private persist: (drafts: DocumentSession[]) => void = () => {}) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.version;
  private changed() {
    this.version++;
    try { this.persist([...this.documents.values()].filter(s => s.draft !== s.base)); }
    catch (e) {
      for (const session of this.documents.values()) if (session.draft !== session.base) session.error = `草稿恢复缓存写入失败：${String(e)}`;
    }
    for (const listener of this.listeners) listener();
  }
  recover(entries: DocumentSession[]) {
    for (const entry of entries) if (typeof entry.path === "string" && typeof entry.base === "string" && typeof entry.draft === "string" && entry.base !== entry.draft) {
      this.documents.set(entry.path, { ...entry, saving: false, error: "发现上次未保存的草稿" });
    }
    this.changed();
  }
  async open(path: string) {
    const existing = this.documents.get(path);
    if (existing) return existing.draft;
    const content = await this.transport.read(path);
    if (!this.documents.has(path)) this.documents.set(path, { path, base: content, draft: content, saving: false });
    this.changed();
    return this.documents.get(path)!.draft;
  }
  stage(path: string, draft: string) {
    const session = this.documents.get(path);
    if (!session) throw new Error("笔记尚未加载，不能保存");
    session.draft = draft;
    this.changed();
  }
  async save(path: string): Promise<void> {
    const pending = this.queues.get(path);
    if (pending) { await pending; return this.save(path); }
    const session = this.documents.get(path);
    if (!session || session.base === session.draft) return;
    const job = (async () => {
      session.saving = true;
      this.changed();
      try {
        while (session.base !== session.draft) {
          const content = session.draft;
          await this.transport.write(path, content, session.base);
          session.base = content;
          session.error = undefined;
          session.external = undefined;
          this.changed();
        }
      } catch (error) {
        session.error = String(error);
        throw error;
      } finally { session.saving = false; this.changed(); }
    })();
    this.queues.set(path, job);
    try { await job; } finally { if (this.queues.get(path) === job) this.queues.delete(path); }
  }
  async flush() {
    for (const path of this.documents.keys()) await this.save(path);
  }
  async checkExternal(path: string) {
    const session = this.documents.get(path);
    if (!session || session.saving) return;
    try {
      const base = session.base;
      const content = await this.transport.read(path);
      if (this.documents.get(path) !== session || session.path !== path || session.saving || session.base !== base || content === base) return;
      if (session.draft === base) { session.base = content; session.draft = content; session.error = undefined; }
      else { session.external = content; session.error = "CONFLICT: 检测到外部修改，你的编辑仍保留在草稿中"; }
      this.changed();
    } catch (error) { if (this.documents.get(path) === session && session.path === path) { session.error = `无法读取笔记：${String(error)}`; this.changed(); } }
  }
  /** Release closed, saved documents only. Failed/queued saves and conflicts stay recoverable. */
  pruneClosed(openPaths: ReadonlySet<string>) {
    let removed = 0;
    for (const [path, session] of this.documents) {
      if (!openPaths.has(path) && session.base === session.draft && !session.saving &&
          !session.error && session.external === undefined && !this.queues.has(path)) {
        this.documents.delete(path);
        removed++;
      }
    }
    if (removed) this.changed();
    return removed;
  }
  async useDisk(path: string) {
    const pending = this.queues.get(path);
    if (pending) await pending.catch(() => {});
    const content = await this.transport.read(path);
    this.documents.set(path, { path, base: content, draft: content, saving: false });
    this.changed();
  }
  forget(path: string) {
    for (const key of this.documents.keys()) if (key === path || key.startsWith(`${path}/`)) this.documents.delete(key);
    this.changed();
  }
  remap(from: string, to: string) {
    for (const [key, session] of [...this.documents]) if (key === from || key.startsWith(`${from}/`)) {
      this.documents.delete(key);
      const path = to + key.slice(from.length);
      this.documents.set(path, { ...session, path });
    }
    this.changed();
  }
  async relocate(change: PathChange) {
    const matches = (path: string) => path === change.from || (change.kind === "notebook" && path.startsWith(`${change.from}/`));
    // A write already sent to the old path must settle before its session moves.
    await Promise.all([...this.queues].filter(([path]) => matches(path)).map(([, job]) => job.catch(() => {})));
    for (const [key, session] of [...this.documents]) if (matches(key)) {
      const path = change.to + key.slice(change.from.length);
      if (path === key) continue;
      if (change.kind === "note" && change.before != null && change.after != null) {
        const clean = session.draft === session.base;
        const sameBase = session.base === change.before;
        const title = path.split("/").pop()!;
        session.base = sameBase ? change.after : syncLeadingTitle(session.base, title);
        session.draft = clean && sameBase ? change.after : syncLeadingTitle(session.draft, title);
      }
      session.path = path;
      session.error = undefined;
      session.external = undefined;
      this.documents.delete(key);
      this.documents.set(path, session);
    }
    this.changed();
  }
}
