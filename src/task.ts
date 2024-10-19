/* --------------------------------------------------------------------------

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

import { promisify } from "node:util";

const sleep = promisify(setTimeout);

export type TaskOptions<
  TTaskId extends string,
  TTaskDependencies extends Record<string, unknown>,
  TTaskContext extends Record<string, unknown> & { initial: unknown },
  TTaskReturn,
  TPossibleTaskDependencyId extends string = never,
  TInput = { deps: TTaskDependencies; ctx: TTaskContext },
> = {
  id: TTaskId;
  dependencies?: TPossibleTaskDependencyId[];
  retryPolicy?: RetryPolicy;
  execute: (input: TInput) => Promise<TTaskReturn> | TTaskReturn;
  errorHandler?: (err: Error, input: TInput) => Promise<void> | void;
};

export class Task<
  TTaskDependencies extends Record<string, unknown>,
  TTaskContext extends Record<string, unknown> & { initial: unknown },
  TTaskReturn,
> {
  private readonly _dependencies: string[] = [];

  private _retryPolicy: RetryPolicy = { maxRetries: 0, retryDelayMs: 0 };
  private _status: TaskStatus = "pending";

  constructor(private readonly options: TaskOptions<string, TTaskDependencies, TTaskContext, TTaskReturn, string>) {
    if (options.retryPolicy) {
      this._validateRetryPolicy(options.retryPolicy);
      this._retryPolicy = options.retryPolicy;
    }
  }

  public addDependency(taskId: string) {
    this._dependencies.push(taskId);
  }

  public get dependencies() {
    return this._dependencies;
  }

  public get id() {
    return this.options.id;
  }

  public async run(deps: TTaskDependencies, ctx: TTaskContext): Promise<TTaskReturn> {
    // we retry maxRetries times on top of the initial attempt
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
          } catch (error) {
            console.error(`Error in task error handler for ${this.options.id}: ${error}`);
          }
          this._status = "failed";
          throw error;
        }
        console.error(`Task failed, retrying (attempt ${attempt + 1}/${this._retryPolicy.maxRetries}): ${err}`);
        await sleep(this._retryPolicy.retryDelayMs);
      }
    }

    // This line should never be reached due to the for loop condition,
    // but TypeScript requires a return statement here
    throw new Error("Unexpected end of run method");
  }

  public get status() {
    return this._status;
  }

  private _validateRetryPolicy(retryPolicy: RetryPolicy) {
    const { maxRetries, retryDelayMs } = retryPolicy;
    if (typeof maxRetries !== "number" || maxRetries < 0 || !Number.isInteger(maxRetries)) {
      throw new Error("maxRetries must be a non-negative integer");
    }
    if (typeof retryDelayMs !== "number" || retryDelayMs < 0) {
      throw new Error("retryDelayMs must be a non-negative number");
    }
  }
}

type TaskStatus = "pending" | "completed" | "failed" | "running";

type RetryPolicy = {
  maxRetries: number;
  retryDelayMs: number;
};
