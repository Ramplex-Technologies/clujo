"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/scheduler.ts
var scheduler_exports = {};
__export(scheduler_exports, {
  Scheduler: () => Scheduler
});
module.exports = __toCommonJS(scheduler_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Scheduler
});
//# sourceMappingURL=scheduler.js.map