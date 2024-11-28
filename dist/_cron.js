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

// src/_cron.ts
var cron_exports = {};
__export(cron_exports, {
  Cron: () => Cron
});
module.exports = __toCommonJS(cron_exports);
var import_croner = require("croner");
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
    this.#job = new import_croner.Cron(this.#cronExpression, this.#cronOptions, handler);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Cron
});
//# sourceMappingURL=_cron.js.map