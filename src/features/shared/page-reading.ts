import type { TabInfo } from '../../browser';
import type { TypedText } from './typed-text';

/**
 * One look at a page: `tab show`, the body's innerText, and what was typed into its editable regions. The text is
 * page text, never sent uncleaned, and never with its typed text (`withoutTyped`).
 */
export interface PageReading { tab: TabInfo; text: string; typed: TypedText }
