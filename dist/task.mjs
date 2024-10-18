// src/task.ts
import { promisify } from "node:util";
var sleep = promisify(setTimeout);
var Task = class {
  constructor(options) {
    this.options = options;
    if (options.retryPolicy) {
      this._validateRetryPolicy(options.retryPolicy);
      this._retryPolicy = options.retryPolicy;
    }
  }
  _dependencies = [];
  _retryPolicy = { maxRetries: 0, retryDelayMs: 0 };
  _status = "pending";
  addDependency(taskId) {
    this._dependencies.push(taskId);
  }
  get dependencies() {
    return this._dependencies;
  }
  get id() {
    return this.options.id;
  }
  async run(deps, ctx) {
    for (let attempt = 0; attempt < this._retryPolicy.maxRetries + 1; attempt++) {
      try {
        this._status = "running";
        const result = await this.options.execute({ deps, ctx });
        this._status = "completed";
        return result;
      } catch (err) {
        if (attempt === this._retryPolicy.maxRetries) {
          console.error(`Task failed after ${attempt + 1} attempts: ${err}`);
          const error = err instanceof Error ? err : new Error(`Non error throw: ${String(err)}`);
          try {
            if (this.options.errorHandler) await this.options.errorHandler(error, { deps, ctx });
            else console.error(`Error in task ${this.options.id}: ${err}`);
          } catch (error2) {
            console.error(`Error in task error handler for ${this.options.id}: ${error2}`);
          }
          this._status = "failed";
          throw error;
        }
        console.error(`Task failed, retrying (attempt ${attempt + 1}/${this._retryPolicy.maxRetries}): ${err}`);
        await sleep(this._retryPolicy.retryDelayMs);
      }
    }
    throw new Error("Unexpected end of run method");
  }
  get status() {
    return this._status;
  }
  _validateRetryPolicy(retryPolicy) {
    const { maxRetries, retryDelayMs } = retryPolicy;
    if (typeof maxRetries !== "number" || maxRetries < 0 || !Number.isInteger(maxRetries)) {
      throw new Error("maxRetries must be a non-negative integer");
    }
    if (typeof retryDelayMs !== "number" || retryDelayMs < 0) {
      throw new Error("retryDelayMs must be a non-negative number");
    }
  }
};
export {
  Task
};
//# sourceMappingURL=task.mjs.map