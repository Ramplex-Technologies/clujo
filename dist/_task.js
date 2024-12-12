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

// src/_task.ts
var task_exports = {};
__export(task_exports, {
  Task: () => Task
});
module.exports = __toCommonJS(task_exports);
var import_node_util = require("util");
var Task = class {
  #options;
  #retryPolicy = { maxRetries: 0, retryDelayMs: 0 };
  #status = "pending";
  constructor(options) {
    if (options.retryPolicy) {
      this.#validateRetryPolicy(options.retryPolicy);
      this.#retryPolicy = options.retryPolicy;
    }
    this.#options = options;
  }
  /**
   * Return whether this task is enabled or not
   */
  get isEnabled() {
    return this.#options.enabled === void 0 || this.#options.enabled;
  }
  /**
   * Gets the ID of the task.
   *
   * @returns The task ID
   */
  get id() {
    return this.#options.id;
  }
  /**
   * Executes the task with the given dependencies and context, retrying if necessary
   * up to the maximum number of retries specified in the retry policy. Each retry
   * is separated by the retry delay (in ms) specified in the retry policy.
   *
   * @param {TTaskDependencies} deps - The task dependencies
   * @param {TTaskContext} ctx - The task context
   * @returns {Promise<TTaskReturn>} A promise that resolves with the task result
   * @throws {Error} If the task execution fails after all retry attempts
   */
  async run(deps, ctx) {
    if (!this.isEnabled) {
      this.#status = "skipped";
      return null;
    }
    const input = {
      deps,
      ctx
    };
    for (let attempt = 0; attempt < this.#retryPolicy.maxRetries + 1; attempt++) {
      try {
        this.#status = "running";
        const result = await this.#options.execute(input);
        this.#status = "completed";
        return result;
      } catch (err) {
        if (attempt === this.#retryPolicy.maxRetries) {
          console.error(`Task failed after ${attempt + 1} attempts: ${err}`);
          const error = err instanceof Error ? err : new Error(`Non error throw: ${String(err)}`);
          try {
            if (this.#options.errorHandler) {
              await this.#options.errorHandler(error, input);
            } else {
              console.error(`Error in task ${this.#options.id}: ${err}`);
            }
          } catch (error2) {
            console.error(`Error in task error handler for ${this.#options.id}: ${error2}`);
          }
          this.#status = "failed";
          throw error;
        }
        console.error(`Task failed, retrying (attempt ${attempt + 1}/${this.#retryPolicy.maxRetries}): ${err}`);
        await sleep(this.#retryPolicy.retryDelayMs);
      }
    }
    throw new Error("Unexpected end of run method");
  }
  /**
   * Gets the status of the task.
   *
   * @returns The current status of the task
   */
  get status() {
    return this.#status;
  }
  #validateRetryPolicy(retryPolicy) {
    const { maxRetries, retryDelayMs } = retryPolicy;
    if (typeof maxRetries !== "number" || maxRetries < 0 || !Number.isInteger(maxRetries)) {
      throw new Error("maxRetries must be a non-negative integer");
    }
    if (typeof retryDelayMs !== "number" || retryDelayMs < 0) {
      throw new Error("retryDelayMs must be a non-negative number");
    }
  }
};
var sleep = (0, import_node_util.promisify)(setTimeout);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Task
});
//# sourceMappingURL=_task.js.map