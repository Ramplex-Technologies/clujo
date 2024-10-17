/* --------------------------------------------------------------------------

  croner - MIT License - Hexagon <hexagon@56k.guru>
  ioredis - MIT License - Zihua Li
  redis-semaphore - MIT License - Alexander Mochalin

  ---------------------------------------------------------------------------

  MIT License

  Copyright (c) 2024 Rami Pellumbi

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
-----------------------------------------------------------------------------*/

import type { CronOptions } from "croner";
import type { Redis } from "ioredis";
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

  /**
   * Starts the cron job, which will execute the task graph according to the cron schedule.
   * If a redis client instance is provided, a lock will be acquired before executing the task graph, preventing overlapping executions.
   *
   * @param redis The Redis client to use for locking.
   * @param onTaskCompletion An optional function to execute after the task graph has completed.
   * @param runImmediately An optional boolean which, if set to true, executes the task graph immediately upon starting.
   *    The overlap behavior here depends on if a lock is used (never any overlap), or if `preventOverlap` was disabled (
   *    in which case there is overlap between multiple instances of the same Clujo).
   * @returns The Clujo instance.
   * @throws An error if the Clujo has already started.
   */
  public start(
    {
      redis,
      onTaskCompletion,
      runImmediately,
    }: {
      redis?: { client: Redis; lockOptions?: LockOptions };
      onTaskCompletion?: (ctx: TTaskContext) => void | Promise<void>;
      runImmediately?: boolean;
    } = {
      redis: undefined,
      onTaskCompletion: undefined,
      runImmediately: false,
    },
  ) {
    if (this._hasStarted) throw new Error("Cannot start a Clujo that has already started.");
    if (redis) if (!redis.client) throw new Error("Redis client is required.");
    if (onTaskCompletion && typeof onTaskCompletion !== "function") {
      throw new Error("onTaskCompletion must be a function (sync or async).");
    }
    if (runImmediately && typeof runImmediately !== "boolean") {
      throw new Error("runImmediately must be a boolean.");
    }

    const executeTasksAndCompletionHandler = async () => {
      const finalContext = await this._taskGraphRunner.run();
      if (onTaskCompletion) await onTaskCompletion(finalContext);
    };

    const handler = async () => {
      try {
        if (!redis) await executeTasksAndCompletionHandler();
        else {
          await using lock = await this._tryAcquire(redis.client, redis.lockOptions);
          if (lock) await executeTasksAndCompletionHandler();
        }
      } catch (error) {
        console.error(`Clujo ${this.id} failed: ${error}`);
      }
    };
    this._cron.start(handler);
    this._hasStarted = true;
    // we use the cron trigger here so that prevent overlapping is active by default
    // i.e., if no lock is used, and the trigger is executing, and the schedule time is reached, the scheduled execution will be skipped
    if (runImmediately) this._cron.trigger();
    return this;
  }

  /**
   * Stops the cron job and prevents any further executions of the task graph.
   * If the task graph is currently executing, it will be allowed to finish for up to the specified timeout.
   *
   * @param timeout The maximum time to wait for the task graph to finish executing before stopping the cron.
   * @returns A promise that resolves when the cron has stopped.
   * @throws An error if the Clujo has not started.
   */
  public async stop(timeout = 5000): Promise<void> {
    if (!this._hasStarted) throw new Error("Cannot stop a Clujo that has not started.");
    await this._cron.stop(timeout);
  }

  /**
   * Trigger an execution of the task graph immediately, independent of the cron schedule.
   * In the event the cron is running, the task graph will still execute.
   *
   * @returns The final context of the task graph.
   */
  public async trigger(): Promise<TTaskContext> {
    // we do not trigger via the cron here so that we can make use of the result of the task graph
    return await this._taskGraphRunner.run();
  }

  /**
   * Tries to acquire a lock from redis-semaphore. If the lock is acquired, the lock will be released when the lock is disposed.
   *
   * @param redis The Redis client to use.
   * @param lockOptions The options to use when acquiring the lock.
   *
   * @returns An AsyncDisposable lock if it was acquired, otherwise null.
   */
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
