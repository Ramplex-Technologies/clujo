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

// Creates a context type with required dependencies and optional other keys
type ContextWithDependencies<TContext extends Record<string, unknown>, TDependencies extends string> = Required<
    Pick<TContext, TDependencies | "initial">
> &
    Partial<Omit<TContext, TDependencies | "initial">>;

import { promisify } from "node:util";

/**
 * Represents the options for a task.
 *
 * @template TTaskId - string literal type representing the task ID
 * @template TTaskDependencies - Type of task dependencies passed into the task execution function
 * @template TTaskContext - Type of task context passed into the task execution function
 * @template TTaskReturn - Type of task return value
 * @template TPossibleTaskDependencyId - string literal type representing the possible dependencies of this task
 * @template TInput - Type of the input object passed into the task execution function and error handler
 *
 */
export type TaskOptions<
    TTaskId extends string,
    TTaskDependencies extends Record<string, unknown>,
    TTaskContext extends Record<string, unknown> & { initial: unknown },
    TTaskReturn,
    TPossibleTaskDependencyId extends string = never,
    TInput = {
        deps: TTaskDependencies;
        ctx: [TPossibleTaskDependencyId] extends [never]
            ? TTaskContext
            : ContextWithDependencies<TTaskContext, TPossibleTaskDependencyId>;
    },
> = {
    /**
     * The unique ID of the task.
     */
    id: TTaskId;
    /**
     * The dependencies of the task.
     */
    dependencies?: readonly TPossibleTaskDependencyId[];
    /**
     * The retry policy for the task.
     *
     * @default { maxRetries: 0, retryDelayMs: 0 }
     */
    retryPolicy?: RetryPolicy;
    /**
     * The function that executes the task.
     * This function receives the task dependencies and context as input. It can be synchronous or asynchronous.
     *
     * @param input - The input object containing the task dependencies and context
     * @returns The return value of the task
     * @throws An error if the task execution fails after all retry attempts
     */
    execute: (input: TInput) => Promise<TTaskReturn> | TTaskReturn;
    /**
     * An optional error handler for the task.
     * This function receives an error and the input object as input. It can be synchronous or asynchronous.
     * When an error handler is provided, it will be invoked when the task execution fails after all retry attempts.
     * The error will still be thrown after the error handler has been executed.
     *
     * @param err - The error that occurred during task execution
     * @param input - The input object containing the task dependencies and context
     * @returns A promise that resolves when the error has been handled
     * @default console.error
     */
    errorHandler?: (err: Error, input: TInput) => Promise<void> | void;
};

/**
 * Represents a task that can be executed. A task takes a set of dependencies and a context as input,
 * and returns a (potentially void) value when executed.
 *
 * @template TTaskDependencies - Type of task dependencies
 * @template TTaskContext - Type of task context
 * @template TTaskReturn - Type of task return value
 */
export class Task<
    TTaskDependencies extends Record<string, unknown>,
    TTaskContext extends Record<string, unknown> & { initial: unknown },
    TTaskReturn,
    TPossibleTaskDependencyId extends string = never,
> {
    readonly #dependencies: string[] = [];
    readonly #options: TaskOptions<string, TTaskDependencies, TTaskContext, TTaskReturn, TPossibleTaskDependencyId>;

    #retryPolicy: RetryPolicy = { maxRetries: 0, retryDelayMs: 0 };
    #status: TaskStatus = "pending";

    constructor(options: TaskOptions<string, TTaskDependencies, TTaskContext, TTaskReturn, TPossibleTaskDependencyId>) {
        if (options.retryPolicy) {
            this.#validateRetryPolicy(options.retryPolicy);
            this.#retryPolicy = options.retryPolicy;
        }
        this.#options = options;
    }

    /**
     * Adds a dependency to the task.
     *
     * @param taskId - The ID of the task to add as a dependency
     */
    addDependency(taskId: string): void {
        if (taskId === this.#options.id) {
            throw new Error("A task cannot depend on itself");
        }
        this.#dependencies.push(taskId);
    }

    /**
     * Gets the list of task dependencies.
     *
     * @returns An array of task IDs representing the dependencies
     */
    get dependencies(): string[] {
        return this.#dependencies;
    }

    /**
     * Gets the ID of the task.
     *
     * @returns The task ID
     */
    get id(): string {
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
    async run(deps: TTaskDependencies, ctx: TTaskContext): Promise<TTaskReturn> {
        const input = {
            deps,
            ctx: ctx as [TPossibleTaskDependencyId] extends [never]
                ? TTaskContext
                : ContextWithDependencies<TTaskContext, TPossibleTaskDependencyId>,
        };
        // we retry maxRetries times on top of the initial attempt
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
                    } catch (error) {
                        console.error(`Error in task error handler for ${this.#options.id}: ${error}`);
                    }
                    this.#status = "failed";
                    throw error;
                }
                console.error(`Task failed, retrying (attempt ${attempt + 1}/${this.#retryPolicy.maxRetries}): ${err}`);
                await sleep(this.#retryPolicy.retryDelayMs);
            }
        }

        // This line should never be reached due to the for loop condition,
        // but TypeScript requires a return statement here
        throw new Error("Unexpected end of run method");
    }

    /**
     * Gets the status of the task.
     *
     * @returns The current status of the task
     */
    get status(): TaskStatus {
        return this.#status;
    }

    #validateRetryPolicy(retryPolicy: RetryPolicy) {
        const { maxRetries, retryDelayMs } = retryPolicy;
        if (typeof maxRetries !== "number" || maxRetries < 0 || !Number.isInteger(maxRetries)) {
            throw new Error("maxRetries must be a non-negative integer");
        }
        if (typeof retryDelayMs !== "number" || retryDelayMs < 0) {
            throw new Error("retryDelayMs must be a non-negative number");
        }
    }
}

const sleep = promisify(setTimeout);

/**
 * Defines the retry policy for a task.
 */
type RetryPolicy = {
    /**
     * The maximum number of retry attempts.
     */
    maxRetries: number;
    /**
     * The delay in milliseconds between retry attempts.
     */
    retryDelayMs: number;
};

/**
 * Represents the possible states of a task.
 *
 * - pending: Task is pending execution start
 * - running: Task is executing
 * - completed: Task has been executed successfully
 * - failed: Task has failed to execute
 */
type TaskStatus = "pending" | "running" | "completed" | "failed";
