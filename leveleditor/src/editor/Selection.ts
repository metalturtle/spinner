export type SelectionItem = { type: string; id: string };
type SelectionListener = (selection: SelectionItem | null) => void;
type MultiSelectionListener = (items: ReadonlyArray<SelectionItem>) => void;

export class Selection {
  private items: SelectionItem[] = [];
  private listeners = new Set<SelectionListener>();
  private multiListeners = new Set<MultiSelectionListener>();

  // Backward compat: returns first selected item or null
  get selected(): SelectionItem | null {
    return this.items.length > 0 ? this.items[0] : null;
  }

  get selectedItems(): ReadonlyArray<SelectionItem> {
    return this.items;
  }

  get selectedCount(): number {
    return this.items.length;
  }

  // Replace entire selection with one item
  select(type: string, id: string): void {
    this.items = [{ type, id }];
    this.notify();
  }

  // Add to selection (preserving order)
  addToSelection(type: string, id: string): void {
    if (this.isSelected(type, id)) return;
    this.items.push({ type, id });
    this.notify();
  }

  // Toggle in/out of selection
  toggleSelection(type: string, id: string): void {
    const idx = this.items.findIndex((s) => s.type === type && s.id === id);
    if (idx >= 0) {
      this.items.splice(idx, 1);
    } else {
      this.items.push({ type, id });
    }
    this.notify();
  }

  deselect(): void {
    if (this.items.length === 0) return;
    this.items = [];
    this.notify();
  }

  isSelected(type: string, id: string): boolean {
    return this.items.some((s) => s.type === type && s.id === id);
  }

  getSelectedPolygonIds(): string[] {
    return this.items.filter((s) => s.type === 'polygon').map((s) => s.id);
  }

  onChange(listener: SelectionListener): void {
    this.listeners.add(listener);
  }

  offChange(listener: SelectionListener): void {
    this.listeners.delete(listener);
  }

  onMultiChange(listener: MultiSelectionListener): void {
    this.multiListeners.add(listener);
  }

  offMultiChange(listener: MultiSelectionListener): void {
    this.multiListeners.delete(listener);
  }

  private notify(): void {
    const single = this.selected;
    this.listeners.forEach((fn) => fn(single));
    this.multiListeners.forEach((fn) => fn(this.items));
  }
}
