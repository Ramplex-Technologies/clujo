import { CronOptions } from 'croner';

declare class Cron {
    private readonly cronExpression;
    private readonly cronOptions?;
    private job;
    constructor(cronExpression: string, cronOptions?: CronOptions | undefined);
    start(handler: () => Promise<void> | void): void;
    stop(timeout: number): Promise<void>;
}

export { Cron };
