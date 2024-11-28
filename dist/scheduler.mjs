// src/scheduler.ts
var Scheduler = class {
  #jobs = [];
  /**
   * Adds a Clujo job to the scheduler.
   * @param input - Object containing the job and optional completion handler.
   * @param input.job - The Clujo job to be added.
   * @param input.completionHandler - Optional function to invoke after the job completes.
   */
  // biome-ignore lint/suspicious/noExplicitAny: handle any Clujo
  addJob(job) {
    if (this.#jobs.some((addedJob) => addedJob.id === job.id)) {
      throw new Error(`Job with id ${job.id} is already added to the scheduler.`);
    }
    this.#jobs.push(job);
  }
  /**
   * Starts all added jobs in the scheduler.
   *
   * @param redis - Optional Redis instance to be passed to the jobs. If provided, enables distributed locking.
   */
  start() {
    for (const job of this.#jobs) {
      job.start();
    }
  }
  /**
   * Stops all running jobs in the scheduler.
   *
   * @param timeout - The maximum time (in milliseconds) to wait for jobs to stop. Defaults to 5000ms.
   * @returns A promise that resolves when all jobs have stopped or the timeout is reached.
   */
  async stop(timeout = 5e3) {
    await Promise.all(this.#jobs.map((job) => job.stop(timeout)));
  }
  /**
   * Returns the list of jobs added to the scheduler.
   */
  get jobs() {
    return this.#jobs;
  }
};
export {
  Scheduler
};
//# sourceMappingURL=scheduler.mjs.map