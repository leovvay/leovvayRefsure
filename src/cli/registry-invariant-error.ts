/** A command broke a registry rule (an `acts: never` verb acted). A bug, never a page condition. */
export class RegistryInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryInvariantError';
  }
}
