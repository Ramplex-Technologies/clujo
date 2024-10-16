import { CronOptions } from 'croner';
import { ICron } from './cron.types.mjs';

declare class Cron implements ICron {
    private readonly cronExpression;
    private readonly cronOptions?;
    private job;
    constructor(cronExpression: string, cronOptions?: CronOptions | undefined);
    start(handler: () => Promise<void> | void): void;
    stop(timeout: number): Promise<void>;
}

export { Cron };
