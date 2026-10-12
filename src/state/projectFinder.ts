export type ProjectSort = 'recent' | 'name' | 'size';

export interface FindableProject {
  id: string;
  name: string;
  savedAt: number;
  size: number;
  searchText?: string;
}

export const recentPinId = (key: string) => `recent:${key}`;
export const devicePinId = (path: string) => `device:${path}`;

/** Filter projects by name or useful local metadata, then pin-first and sort deterministically. */
export function findProjects<T extends FindableProject>(
  projects: T[],
  query: string,
  pinnedIds: readonly string[],
  sort: ProjectSort,
): T[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const pinned = new Set(pinnedIds);
  return projects
    .filter((project) => {
      const text = `${project.name} ${project.searchText || ''}`.toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    })
    .map((project, index) => ({ project, index }))
    .sort((a, b) => {
      const ap = pinned.has(a.project.id), bp = pinned.has(b.project.id);
      if (ap !== bp) return ap ? -1 : 1;
      if (sort === 'name') return a.project.name.localeCompare(b.project.name, undefined, { sensitivity: 'base', numeric: true }) || a.index - b.index;
      if (sort === 'size') return b.project.size - a.project.size || b.project.savedAt - a.project.savedAt || a.index - b.index;
      return b.project.savedAt - a.project.savedAt || a.index - b.index;
    })
    .map(({ project }) => project);
}

export function togglePinnedId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
