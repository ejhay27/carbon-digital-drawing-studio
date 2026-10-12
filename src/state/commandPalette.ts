export interface PaletteSearchItem {
  id: string;
  title: string;
  category: string;
  keywords?: string;
  disabled?: boolean;
}

/** Word-wise, case-insensitive search across the visible label, category and aliases. */
export function searchPaletteItems<T extends PaletteSearchItem>(items: T[], query: string): T[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter((item) => {
    const text = `${item.title} ${item.category} ${item.keywords || ''}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function nextPaletteSelection<T extends { disabled?: boolean }>(items: T[], current: number, direction: 1 | -1): number {
  if (!items.length) return -1;
  const start = current < 0 ? (direction > 0 ? -1 : 0) : current;
  for (let step = 1; step <= items.length; step++) {
    const index = (start + direction * step + items.length * 2) % items.length;
    if (!items[index].disabled) return index;
  }
  return -1;
}

export function firstPaletteSelection<T extends { disabled?: boolean }>(items: T[]): number {
  return items.findIndex((item) => !item.disabled);
}
