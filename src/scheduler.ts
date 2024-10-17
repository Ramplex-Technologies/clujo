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
   * @param timeout - The maximum time (in milliseconds) to wait for jobs to stop.
   * @returns A promise that resolves when all jobs have stopped or the timeout is reached.
   */
  public async stop(timeout: number) {
    await Promise.all(this.jobs.map(({ job }) => job.stop(timeout)));
  }
}
