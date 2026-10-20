export const ITEM_CATEGORIES = [
  { id: 'comum', label: 'Comum' },
  { id: 'com_cobertura', label: 'Cobertura' },
  { id: 'sobremesas', label: 'Sobremesas' }
] as const;

export type ItemCategory = typeof ITEM_CATEGORIES[number]['id'];

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  comum: 'Comum',
  com_cobertura: 'Cobertura',
  sobremesas: 'Sobremesas'
};

export function isItemCategory(value: unknown): value is ItemCategory {
  return ITEM_CATEGORIES.some(category => category.id === value);
}
