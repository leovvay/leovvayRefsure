/**
 * Where a field's options sit: inside the field (a native select lists them under its popup, even closed), or in
 * the nearest listbox after it (a custom dropdown). `options` are node indices in text order.
 */
export interface FieldOptions { options: number[]; within: 'field' | 'listbox' }
