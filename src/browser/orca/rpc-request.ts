/** One runtime call, as the `orca` CLI's own handler would send it for the same argv. */
export interface RpcRequest {
  method: string;
  params: Record<string, unknown>;
}
