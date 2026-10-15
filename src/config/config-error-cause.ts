/**
 * Why a config could not be used. The registry maps every one to `not_set_up` (exit 23) and names the cause.
 * - `config_mode`: the file is readable or writable by group or others.
 * - `literal_key`: a key spec holds something other than an env name or a command.
 * - `gateway_insecure`: a gateway URL that is neither https nor localhost.
 * - `config_invalid`: anything else the file gets wrong.
 */
export type ConfigErrorCause = 'config_mode' | 'literal_key' | 'gateway_insecure' | 'config_invalid';
