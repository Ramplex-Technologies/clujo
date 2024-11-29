// src/_cron.ts
import { Cron as Croner } from "croner";
var Cron = class {
  #jobs = null;
  #cronExpression;
  #cronOptions;
  #isRunning = false;
  constructor(cronExpression, cronOptions) {
    this.#cronExpression = cronExpression;
    this.#cronOptions = { protect: true, ...cronOptions };
  }
  /**
   * Starts the cron job with the specified handler.
   *
   * @param handler A function to be executed when the cron job triggers.
   * @throws {Error} If attempting to start a job that has already been started.
   */
  start(handler) {
    if (this.#jobs) {
      throw new Error("Attempting to start an already started job");
    }
    const wrapHandler = async () => {
      if (this.#cronOptions?.protect && this.#isRunning) {
        return;
      }
      try {
        this.#isRunning = true;
        await handler();
      } finally {
        this.#isRunning = false;
      }
    };
    this.#jobs = Array.isArray(this.#cronExpression) ? this.#cronExpression.map((expression) => new Croner(expression, this.#cronOptions, wrapHandler)) : [new Croner(this.#cronExpression, this.#cronOptions, handler)];
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
        if (!this.#jobs) {
          resolve();
          return;
        }
        if (this.#jobs.some((job) => job.isBusy())) {
          if (Date.now() - startTime > timeout) {
            for (const job of this.#jobs) {
              job.stop();
              this.#jobs = null;
            }
            resolve();
            return;
          }
          setTimeout(checkAndStop, 100);
        } else {
          for (const job of this.#jobs) {
            job.stop();
          }
          this.#jobs = null;
          resolve();
          return;
        }
      };
      checkAndStop();
    });
  }
  /**
   * Triggers the cron job to run immediately. A triggered execution will prevent the job from running at its scheduled time
   * unless `protect` is set to `false` in the cron options.
   *
   * @throws {Error} If attempting to trigger a job that is not running.
   */
  async trigger() {
    if (!this.#jobs) {
      throw new Error("Attempting to trigger a job that is not running");
    }
    await this.#jobs[0].trigger();
  }
};
export {
  Cron
};
//# sourceMappingURL=_cron.mjs.map