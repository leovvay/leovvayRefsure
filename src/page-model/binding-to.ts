import type { ActBinding } from '../browser';
import { rowContains } from './row-text';

/** The binding for a click on an element the guard read as `name`: page text carries it as a row would (`rowContains`). */
export function bindingTo(name: string): ActBinding {
  return { name, carries: (text) => rowContains(text, name) };
}
