interface ICron {
    /**
     * Starts the cron job with the specified handler.
     * @param handler A function to be executed when the cron job triggers.
     * @throws {Error} If attempting to start a job that has already been started.
     */
    start(handler: () => Promise<void> | void): void;
    /**
     * Stops the cron job. If the job is currently running, it will wait for the job to finish before stopping it.
     * This can be safely invoked even if the job hasn't been started.
     */
    stop(): Promise<void>;
    /**
     * Triggers the cron job manually.
     * @returns {Promise<void>} A promise that resolves when the job has been triggered.
     * @throws {Error} If attempting to trigger a job that hasn't been started.
     */
    trigger(): Promise<void>;
}

export type { ICron };