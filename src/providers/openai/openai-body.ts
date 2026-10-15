/** A Choice keeps its criteria as ordered choices; a Noul is asked as a predicate. */
export type OpenAIQuestion =
  | { type: 'predicate'; name: string; instructions: string }
  | { type: 'choice'; name: string; instructions: string; choices: { value: string; description: string }[] };

/** The `/v1/decisions` request body: `input` is the rendered state. */
export interface OpenAIBody { model: string; input: string; questions: OpenAIQuestion[] }
