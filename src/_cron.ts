/* --------------------------------------------------------------------------

  croner - MIT License - Hexagon <hexagon@56k.guru>

  ---------------------------------------------------------------------------

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

import { type CronOptions, Cron as Croner } from "croner";

export class Cron {
    #jobs: Croner[] | null = null;
    readonly #cronExpression: string | Date | (string | Date)[];
    readonly #cronOptions: CronOptions | undefined;

    #isRunning = false;

    constructor(cronExpression: string | Date | (string | Date)[], cronOptions?: CronOptions) {
        this.#cronExpression = cronExpression;
        // default to protect mode (prevent overlapping executions) on the same process in the single pattern case
        this.#cronOptions = { protect: true, ...cronOptions };
    }

    /**
     * Starts the cron job with the specified handler.
     *
     * @param handler A function to be executed when the cron job triggers.
     * @throws {Error} If attempting to start a job that has already been started.
     */
    start(handler: () => Promise<void> | void): void {
        if (this.#jobs) {
            throw new Error("Attempting to start an already started job");
        }
        // if using multiple expressions, prevent all from overlapping
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
        this.#jobs = Array.isArray(this.#cronExpression)
            ? this.#cronExpression.map((expression) => new Croner(expression, this.#cronOptions, wrapHandler))
            : [new Croner(this.#cronExpression, this.#cronOptions, wrapHandler)];
    }

    /**
     * Stops the cron job. If the job is currently running, it will wait for the job to finish before stopping it.
     * This can be safely invoked even if the job hasn't been started.
     *
     * @param timeout The maximum time (in ms) to wait for the job to finish before stopping it forcefully.
     * @returns A promise that resolves when the job has been stopped
     */
    stop(timeout: number): Promise<void> {
        return new Promise<void>((resolve) => {
            const startTime = Date.now();
            const checkAndStop = () => {
                if (!this.#jobs) {
                    resolve(); // resolve if job has cleared
                    return;
                }

                if (this.#jobs.some((job) => job.isBusy())) {
                    if (Date.now() - startTime > timeout) {
                        for (const job of this.#jobs) {
                            job.stop();
                        }
                        this.#jobs = null;
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
    async trigger(): Promise<void> {
        if (!this.#jobs) {
            throw new Error("Attempting to trigger a job that is not running");
        }
        await this.#jobs[0].trigger();
    }
}
