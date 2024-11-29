import { CronOptions } from 'croner';

declare class Cron {
    #private;
    constructor(cronExpression: string | Date | (string | Date)[], cronOptions?: CronOptions);
    /**
     * Starts the cron job with the specified handler.
     *
     * @param handler A function to be executed when the cron job triggers.
     * @throws {Error} If attempting to start a job that has already been started.
     */
    start(handler: () => Promise<void> | void): void;
    /**
     * Stops the cron job. If the job is currently running, it will wait for the job to finish before stopping it.
     * This can be safely invoked even if the job hasn't been started.
     *
     * @param timeout The maximum time (in ms) to wait for the job to finish before stopping it forcefully.
     * @returns A promise that resolves when the job has been stopped
     */
    stop(timeout: number): Promise<void>;
    /**
     * Triggers the cron job to run immediately. A triggered execution will prevent the job from running at its scheduled time
     * unless `protect` is set to `false` in the cron options.
     *
     * @throws {Error} If attempting to trigger a job that is not running.
     */
    trigger(): Promise<void>;
}

export { Cron };
