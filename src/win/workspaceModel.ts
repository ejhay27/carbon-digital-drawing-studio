export type DocumentWorkspace = 'draw' | 'comic' | '3d' | 'infinite';

/** Minimal project shape used to decide which document-backed studio owns a tab. */
export interface WorkspaceDocument {
  id: string;
  comic?: unknown;
  scene3d?: unknown;
  infinitePainter?: unknown;
}

/** Each document extension routes to its own studio without reusing another tab's state. */
export function documentWorkspace(doc: WorkspaceDocument | null | undefined): DocumentWorkspace {
  if (doc?.comic) return 'comic';
  if (doc?.scene3d) return '3d';
  if (doc?.infinitePainter) return 'infinite';
  return 'draw';
}

/** Find the first open document that belongs to the requested document-backed studio. */
export function findWorkspaceDocument<T extends WorkspaceDocument>(docs: readonly T[], workspace: DocumentWorkspace): T | null {
  return docs.find((doc) => documentWorkspace(doc) === workspace) || null;
}
