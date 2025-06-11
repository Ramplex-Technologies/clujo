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

import type { Clujo } from "./clujo";

/**
 * Scheduler class for managing and running Clujo jobs.
 * This class allows adding, starting, and stopping multiple Clujo jobs in a centralized manner.
 */
export class Scheduler {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    readonly #jobs: Clujo<any>[] = [];

    /**
     * Adds a Clujo job to the scheduler.
     * @param input - Object containing the job and optional completion handler.
     * @param input.job - The Clujo job to be added.
     * @param input.completionHandler - Optional function to invoke after the job completes.
     */

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    addJob(job: Clujo<any>) {
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
    async stop(timeout = 5000) {
        await Promise.all(this.#jobs.map((job) => job.stop(timeout)));
    }

    /**
     * Returns the list of jobs added to the scheduler.
     */

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    get jobs(): Clujo<any>[] {
        return this.#jobs;
    }
}
