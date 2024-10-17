import type { CronOptions } from "croner";
import type Redis from "ioredis";
import { type LockOptions, Mutex } from "redis-semaphore";
import { Cron } from "./cron";
import type { TaskGraphRunner } from "./task-graph";

export class Clujo<
  TTaskDependencies extends Record<string, unknown>,
  TTaskContext extends Record<string, unknown> & {
    initial: unknown;
  },
> {
  public readonly id: string;

  private readonly _cron: Cron;
  private readonly _taskGraphRunner: TaskGraphRunner<TTaskDependencies, TTaskContext>;

  private _hasStarted = false;
  private _runImmediately = false;

  constructor({
    id,
    taskGraphRunner,
    cron,
  }: {
    id: string;
    taskGraphRunner: TaskGraphRunner<TTaskDependencies, TTaskContext>;
    cron: { pattern: string; options?: CronOptions };
  }) {
    if (!id) throw new Error("Clujo ID is required.");
    if (!taskGraphRunner) throw new Error("taskGraphRunner is required");
    if (!cron.pattern) throw new Error("cron.pattern is required");
    this.id = id;
    this._taskGraphRunner = taskGraphRunner;
    // TODO: validate pattern
    this._cron = new Cron(cron.pattern, cron.options);
  }

  public runOnStartup() {
    this._runImmediately = true;
    return this;
  }

  public start({
    redis,
    onTaskCompletion,
  }: {
    redis?: { client: Redis; lockOptions?: LockOptions };
    onTaskCompletion?: (ctx: Required<TTaskContext>) => void | Promise<void>;
  } = {}) {
    if (this._hasStarted) throw new Error("Cannot start a Clujo that has already started.");
    const executeTasksAndCompletionHandler = async () => {
      const finalContext = await this._taskGraphRunner.run();
      if (onTaskCompletion) await onTaskCompletion(finalContext);
    };

    const handler = async () => {
      try {
        if (!redis) {
          await executeTasksAndCompletionHandler();
        } else {
          await using lock = await this._tryAcquire(redis.client, redis.lockOptions);
          if (lock) {
            await executeTasksAndCompletionHandler();
          }
        }
      } catch (error) {
        console.error(`Clujo ${this.id} failed: ${error}`);
      }
    };
    this._cron.start(handler);
    this._hasStarted = true;
    if (this._runImmediately) this.trigger();
    return this;
  }

  public async stop(timeout = 5000): Promise<void> {
    if (!this._hasStarted) throw new Error("Cannot stop a Clujo that has not started.");
    await this._cron.stop(timeout);
  }

  public async trigger(): Promise<Required<TTaskContext>> {
    return await this._taskGraphRunner.run();
  }

  private async _tryAcquire(redis: Redis, lockOptions: LockOptions | undefined): Promise<ILock | null> {
    const mutex = new Mutex(redis, this.id, lockOptions);
    const lock = await mutex.tryAcquire();
    if (!lock) return null;
    return {
      mutex,
      [Symbol.asyncDispose]: async () => {
        try {
          await mutex.release();
        } catch (error) {
          console.error(`Error releasing lock for Clujo ${this.id}: ${error}`);
        }
      },
    };
  }
}

interface ILock extends AsyncDisposable {
  mutex: Mutex;
}
