export interface OptionSpec {
  type: 'string' | 'boolean';
  multiple?: boolean;
  short?: string;
  summary: string;
  default?: string | boolean;
}
