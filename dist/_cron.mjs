// src/_cron.ts
import { Cron as Croner } from "croner";
var Cron = class {
  #job = null;
  #cronExpression;
  #cronOptions;
  constructor(cronExpression, cronOptions) {
    this.#cronExpression = cronExpression;
    this.#cronOptions = cronOptions;
  }
  /**
   * Starts the cron job with the specified handler.
   *
   * @param handler A function to be executed when the cron job triggers.
   * @throws {Error} If attempting to start a job that has already been started.
   */
  start(handler) {
    if (this.#job) {
      throw new Error("Attempting to start an already started job");
    }
    this.#job = new Croner(this.#cronExpression, this.#cronOptions, handler);
  }
  /**
   * Stops the cron job. If the job is currently running, it will wait for the job to finish before stopping it.
   * This can be safely invoked even if the job hasn't been started.
   *
   * @param timeout The maximum time (in ms) to wait for the job to finish before stopping it forcefully.
   * @returns A promise that resolves when the job has been stopped
   */
  stop(timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkAndStop = () => {
        if (!this.#job) {
          resolve();
          return;
        }
        if (this.#job.isBusy()) {
          if (Date.now() - startTime > timeout) {
            this.#job.stop();
            this.#job = null;
            resolve();
            return;
          }
          setTimeout(checkAndStop, 100);
        } else {
          this.#job.stop();
          this.#job = null;
          resolve();
          return;
        }
      };
      checkAndStop();
    });
  }
  /**
   * Triggers the cron job to run immediately. A triggered execution will prevent the job from running at its scheduled time
   * unless `preventOverlap` is set to `false` in the cron options.
   *
   * @throws {Error} If attempting to trigger a job that is not running.
   */
  async trigger() {
    if (!this.#job) {
      throw new Error("Attempting to trigger a job that is not running");
    }
    await this.#job.trigger();
  }
};
export {
  Cron
};
//# sourceMappingURL=_cron.mjs.map