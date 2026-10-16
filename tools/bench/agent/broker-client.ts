import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { agentFile } from './config';
import type { LoadedAgentsConfig } from './config';

/*
  The harness side of broker.mjs: starts it through the config's launcher (a secret-store runner that puts
  refsure's key into the broker's environment alone), waits for its port, and drives it over its stdin. The
  harness itself never holds refsure's key.
*/

interface Reply { op?: string; ok?: boolean; ready?: boolean; port?: number; files?: string[]; error?: string; killed?: number }

export class Broker {
  private waiters: ((reply: Reply) => void)[] = [];
  private constructor(private readonly child: ChildProcess, readonly port: number) {}

  /** Starts the broker (the repo's broker.mjs unless named). */
  static start(loaded: LoadedAgentsConfig, brokerPath = agentFile('broker.mjs')): Promise<Broker> {
    const [cmd, ...pre] = loaded.config.broker.launcher.length > 0
      ? [...loaded.config.broker.launcher, process.execPath]
      : [process.execPath];
    // The harness env minus the agent credential: the broker never needs it.
    const env = { ...process.env };
    delete env[loaded.config.claude.credential.from];
    const child = spawn(cmd!, [...pre, brokerPath, '--config', loaded.path], { env, stdio: ['pipe', 'pipe', 'inherit'] });
    return new Promise((resolve, reject) => {
      const lines = createInterface({ input: child.stdout! });
      let broker: Broker | null = null;
      child.on('exit', (code) => {
        if (broker === null) reject(new Error(`the broker exited before it was ready (code ${String(code)})`));
      });
      lines.on('line', (text) => {
        let reply: Reply;
        try {
          reply = JSON.parse(text) as Reply;
        } catch {
          return;
        }
        if (broker === null) {
          if (reply.ready === true && typeof reply.port === 'number') {
            broker = new Broker(child, reply.port);
            resolve(broker);
          }
          return;
        }
        broker.waiters.shift()?.(reply);
      });
    });
  }

  private send(op: Record<string, unknown>): Promise<Reply> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.child.stdin!.write(`${JSON.stringify(op)}\n`);
    });
  }

  async beginRun(run: string, page: string, token: string, log: string, tools: readonly ('orca' | 'refsure')[]): Promise<void> {
    const reply = await this.send({ op: 'run', run, page, token, log, tools });
    if (reply.ok !== true) throw new Error(`broker refused the run: ${reply.error ?? 'unknown'}`);
  }

  async idle(): Promise<number> {
    return (await this.send({ op: 'idle' })).killed ?? 0;
  }

  /** Files under `dir` holding refsure's key value (exact match, done inside the broker). */
  async scan(dir: string): Promise<string[]> {
    return (await this.send({ op: 'scan', dir })).files ?? [];
  }

  async stop(): Promise<void> {
    await Promise.race([this.send({ op: 'exit' }), new Promise((r) => setTimeout(r, 2_000))]);
    this.child.kill();
  }
}
