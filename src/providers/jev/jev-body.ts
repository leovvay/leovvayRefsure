import type { DecisionQuestion } from '../../questions';

/** The `systemone` request body. `provider` is a retention preference the route cannot be held to. */
export interface JevBody {
  model: string;
  state: Readonly<Record<string, string>>;
  questions: Readonly<Record<string, DecisionQuestion>>;
  provider: { zdr: true; data_collection: 'deny' };
}
