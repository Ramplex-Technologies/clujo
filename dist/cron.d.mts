import { CronOptions } from 'croner';
import { ICron } from './cron.types.mjs';

declare class Cron implements ICron {
    private readonly cronExpression;
    private readonly cronOptions?;
    private job;
    constructor(cronExpression: string, cronOptions?: CronOptions | undefined);
    start(handler: () => Promise<void> | void): void;
    stop(): Promise<void>;
    trigger(): Promise<void>;
}

export { Cron };
