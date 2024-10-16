// src/scheduler.ts
var Scheduler = class {
  constructor() {
    // biome-ignore lint/suspicious/noExplicitAny: handle any combination of clujo's
    this.jobs = [];
  }
  /**
   * Adds a Clujo job to the scheduler.
   * @param input - Object containing the job and optional completion handler.
   * @param input.job - The Clujo job to be added.
   * @param input.completionHandler - Optional function to invoke after the job completes.
   */
  addJob(input) {
    this.jobs.push(input);
  }
  /**
   * Starts all added jobs in the scheduler.
   * @param redis - Optional Redis instance to be passed to the jobs. If provided, enables distributed locking.
   */
  start(redis) {
    for (const { job, completionHandler } of this.jobs) {
      job.start({ redis, completionHandler });
    }
  }
  /**
   * Stops all running jobs in the scheduler.
   * @param timeout - The maximum time (in milliseconds) to wait for jobs to stop.
   * @returns A promise that resolves when all jobs have stopped or the timeout is reached.
   */
  async stop(timeout) {
    await Promise.all(this.jobs.map(({ job }) => job.stop(timeout)));
  }
};
export {
  Scheduler
};
//# sourceMappingURL=scheduler.mjs.map