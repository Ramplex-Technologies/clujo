/* --------------------------------------------------------------------------

  croner - MIT License - Hexagon <hexagon@56k.guru>
  ioredis - MIT License - Zihua Li

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

import type Redis from "ioredis";
import type { Clujo } from "./clujo";

/**
 * Scheduler class for managing and running Clujo jobs.
 * This class allows adding, starting, and stopping multiple Clujo jobs in a centralized manner.
 */
export class Scheduler {
  // biome-ignore lint/suspicious/noExplicitAny: handle any combination of clujo's
  private readonly jobs: { job: Clujo<any, any>; completionHandler?: (ctx: any) => Promise<void> | void }[] = [];

  /**
   * Adds a Clujo job to the scheduler.
   * @param input - Object containing the job and optional completion handler.
   * @param input.job - The Clujo job to be added.
   * @param input.completionHandler - Optional function to invoke after the job completes.
   */
  public addJob<
    TDependencies extends Record<string, unknown>,
    TContext extends Record<string, unknown> & { initial: unknown },
  >(input: {
    job: Clujo<TDependencies, TContext>;
    completionHandler?: (ctx: Required<TContext>) => Promise<void> | void;
  }) {
    this.jobs.push(input);
  }

  /**
   * Starts all added jobs in the scheduler.
   *
   * @param redis - Optional Redis instance to be passed to the jobs. If provided, enables distributed locking.
   */
  public start(redis?: Redis) {
    for (const { job, completionHandler } of this.jobs) {
      const options: Record<string, unknown> = {};
      if (redis) {
        options.redis = { client: redis };
      }
      if (completionHandler) {
        options.onTaskCompletion = completionHandler;
      }
      job.start(options);
    }
  }
  /**
   * Stops all running jobs in the scheduler.
   *
   * @param timeout - The maximum time (in milliseconds) to wait for jobs to stop. Defaults to 5000ms.
   * @returns A promise that resolves when all jobs have stopped or the timeout is reached.
   */
  public async stop(timeout = 5000) {
    await Promise.all(this.jobs.map(({ job }) => job.stop(timeout)));
  }
}
