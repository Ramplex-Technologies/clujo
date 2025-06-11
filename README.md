# @ramplex/clujo

**IMPORTANT**: clujo is now published under `@ramplex/clujo` on npm and jsr. If you are using the old `clujo` package, please update your dependencies to use `@ramplex/clujo` instead. All future versions will be published under the new package name.

Clujo is a simple and flexible solution for running any object with a `trigger` method on a cron schedule, with built-in support for preventing overlapping executions in distributed environments.

It would not be possible without the amazing work of the following projects:

- [Croner](https://github.com/Hexagon/croner/tree/master?tab=readme-ov-file): used for cron scheduling
- [ioredis](https://github.com/redis/ioredis) - (not a dependency, but the supported redis client) used to ensure single execution in a clustered/distributed environment
- [redis-semaphore](https://github.com/swarthy/redis-semaphore) (only used if an `ioredis` instance is provided) - used to ensure single execution in a distributed environment

Coming soon: validated bun support.

# Table of Contents

- [Features](#features)
- [Installation](#installation)
    - [npm](#npm-registry)
    - [jsr](#jsr-registry)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [The Runner Interface](#the-runner-interface)
  - [Preventing Overlapping Executions](#preventing-overlapping-executions)
- [Advanced Usage](#advanced-usage)
  - [Multiple Cron Patterns](#multiple-cron-patterns)
  - [One-time Execution](#one-time-execution)
  - [Disabling a Clujo](#disabling-a-clujo)
  - [Logging](#logging)
  - [Using Redis for Distributed Locking](#using-redis-for-distributed-locking)
  - [Running on Startup](#running-on-startup)
  - [Manual Triggering](#manual-triggering)
- [Using the Scheduler](#using-the-scheduler)
  - [Adding Jobs to the Scheduler](#adding-jobs-to-the-scheduler)
  - [Starting All Jobs](#starting-all-jobs)
  - [Stopping All Jobs](#stopping-all-jobs)
- [Examples](#examples)
  - [Simple Counter](#simple-counter)
  - [Database Cleanup](#database-cleanup)
  - [With Workflow](#with-workflow)
- [Contributing](#contributing)
- [License](#license)

# Features

- **Simple API**: Just provide any object with a `trigger` function and a cron schedule
- **No Overlapping Executions**: Built-in protection against concurrent runs of the same job
- **Distributed Locking**: Optional Redis integration for preventing overlaps across multiple instances
- **Flexible Scheduling**: Support for standard cron patterns, multiple patterns, and one-time executions
- **Type Safety**: Full TypeScript support with generic types for your trigger return values
- **Graceful Shutdown**: Clean stop mechanism that waits for running jobs to complete
- **Manual Triggering**: Execute jobs on-demand outside of their schedule
- **Startup Execution**: Option to run immediately when starting
- **Job Management**: Built-in Scheduler class for managing multiple Clujo instances
- **Minimal Dependencies**: Focused on doing one thing well

# Installation

Clujo is available on [jsr](https://jsr.io/@ramplex/clujo) and [npm](https://www.npmjs.com/package/clujo), and supports
Node.js and Deno v2.0.0 or later.


## npm registry

Install Clujo using npm, pnpm, yarn:

```bash
npm install @ramplex/clujo
yarn add @ramplex/clujo
pnpm install @ramplex/clujo
```

## jsr registry

### deno

```bash
deno add jsr:@ramplex/clujo
```

### npm (one of the below, depending on your package manager)

```bash
npx jsr add @ramplex/clujo
yarn dlx jsr add @ramplex/clujo
pnpm dlx jsr add @ramplex/clujo
```

# Quick Start

Here's a simple example to get you started with Clujo:

```typescript
import { Clujo } from '@ramplex/clujo';
// or (in node.js)
// const { Clujo } = require('@ramplex/clujo');

// Create any object with a trigger function
const myRunner = {
  trigger: async () => {
    console.log("Running my scheduled task!");
    // Do your work here
    const result = await performSomeWork();
    return result;
  }
};

// Create a Clujo instance
const clujo = new Clujo({
  id: "my-scheduled-job",
  cron: {
    pattern: "*/5 * * * *", // Every 5 minutes
    options: { tz: "America/New_York" }
  },
  runner: myRunner,
  // Optional: prevent overlapping executions in distributed environments
  redis: { client: redisClient },
  // Optional: run immediately on startup
  runOnStartup: true,
});

// Start the job
clujo.start();

// Manually trigger if needed
const result = await clujo.trigger();

// Gracefully stop
await clujo.stop();
```

# Core Concepts

## The Runner Interface

Clujo works with any object that implements a simple interface:

```typescript
interface IRunner<T> {
  trigger: () => T | Promise<T>;
}
```

This means you can schedule anything - from simple functions wrapped in an object to complex workflow systems, database maintenance tasks, or API polling jobs.

## Preventing Overlapping Executions

By default, Clujo prevents overlapping executions on a single instance. If a job is still running when the next scheduled execution arrives, the new execution is skipped. This behavior is automatic and requires no configuration.

For distributed environments with multiple instances, you can provide a Redis client to ensure only one instance executes the job at any given time across your entire system.

# Advanced Usage

## Multiple Cron Patterns

You can specify multiple cron patterns for a single job:

```typescript
const clujo = new Clujo({
  id: "multi-schedule-job",
  cron: {
    patterns: [
      "0 9 * * *",      // Daily at 9 AM
      "0 17 * * *",     // Daily at 5 PM
      "0 12 * * SAT"    // Saturdays at noon
    ]
  },
  runner: myRunner
});
```

## One-time Execution

Schedule a job to run once at a specific date/time:

```typescript
const clujo = new Clujo({
  id: "holiday-job",
  cron: {
    pattern: new Date("2024-12-25T00:00:00") // Christmas midnight
  },
  runner: myRunner
});
```

## Disabling a Clujo

To disable a Clujo from executing on its schedule, use the `enabled` option:

```typescript
const clujo = new Clujo({
  id: "conditional-job",
  cron: {
    pattern: "*/5 * * * *"
  },
  runner: myRunner,
  enabled: process.env.NODE_ENV === "production"
});
```

When disabled, the Clujo will still exist but will skip execution when triggered.

## Logging

Clujo supports custom logging through a logger interface. The logger can be provided to the Clujo instance to capture various events and errors during execution. Each log level is optional, and you can choose to implement only the methods you need.

```typescript
// Define a logger that implements the IClujoLogger interface
interface IClujoLogger {
    debug?: (message: string) => void;
    log?: (message: string) => void;
    error?: (message: string) => void;
}

// Example implementation using console
const consoleLogger = {
    log: (message) => console.log(`[Clujo] ${message}`),
    debug: (message) => console.debug(`[Clujo] ${message}`),
    error: (message) => console.error(`[Clujo] ${message}`)
};

// Or a custom logger
const customLogger = {
    log: (message) => myLoggingService.info(message),
    debug: (message) => myLoggingService.debug(message),
    error: (message) => myLoggingService.error(message)
};

// Provide the logger to Clujo
const clujo = new Clujo({
    id: "myClujoJob",
    runner: myRunner,
    cron: { pattern: "*/5 * * * *" },
    logger: customLogger
});
```

The logger will capture various events such as:
- Task execution failures
- Distributed lock acquisition and release events
- Disabled execution attempts

If no logger is provided, Clujo will operate silently without logging any events.

## Using Redis for Distributed Locking

When running multiple instances of your application, use Redis to ensure only one instance executes a job at a time:

```typescript
import Redis from 'ioredis';

const client = new Redis();

const clujo = new Clujo({
  id: "distributed-job",
  cron: { pattern: "*/5 * * * *" },
  runner: myRunner,
  redis: {
    client,
    lockOptions: {
      lockTimeout: 30000,    // Lock expires after 30 seconds
      acquireTimeout: 10000  // Wait up to 10 seconds to acquire lock
    }
  },
});
```

## Running on Startup

Execute the job immediately when starting, in addition to the scheduled times:

```typescript
const clujo = new Clujo({
  id: "startup-job",
  cron: { pattern: "0 * * * *" }, // Every hour
  runner: myRunner,
  runOnStartup: true  // Also runs immediately when started
});
```

## Manual Triggering

You can manually trigger a job outside of its schedule:

```typescript
// This runs independently of the schedule and any running instances
const result = await clujo.trigger();
console.log("Manual execution result:", result);
```

# Using the Scheduler

The Scheduler class provides a convenient way to manage multiple Clujo jobs together. It allows you to add, start, and stop groups of jobs in a centralized manner.
It is not required and `Clujo`'s can be managed manually if desired.

## Adding Jobs to the Scheduler

```typescript
import { Scheduler } from '@ramplex/clujo';
import { Redis } from 'ioredis';

const scheduler = new Scheduler();

// Add jobs to the scheduler
scheduler.addJob(myFirstClujo);
scheduler.addJob(mySecondClujo);

// Add more jobs as needed
```

## Starting All Jobs

You can start all added jobs at once, optionally providing a Redis instance for distributed locking:

```typescript
// Start all jobs
scheduler.start();
```

## Stopping All Jobs

To stop all running jobs:

```typescript
// Stop all jobs with a default timeout of 5000ms
await scheduler.stop();

// Or, specify a custom timeout in milliseconds
await scheduler.stop(10000);
```

# Examples

## Simple Counter

```typescript
let count = 0;

const counter = {
  trigger: async () => {
    count++;
    console.log(`Count is now: ${count}`);
    return count;
  }
};

const clujo = new Clujo({
  id: "counter",
  cron: { pattern: "*/10 * * * * *" }, // Every 10 seconds
  runner: counter
});

clujo.start();
```

## Database Cleanup

```typescript
const dbCleanup = {
  trigger: async () => {
    const db = await getDatabase();
    const deleted = await db.deleteOldRecords(30); // 30 days old
    console.log(`Cleaned up ${deleted} old records`);
    return { deletedCount: deleted, timestamp: new Date() };
  }
};

const clujo = new Clujo({
  id: "db-cleanup",
  cron: { pattern: "0 2 * * *" }, // Daily at 2 AM
  runner: dbCleanup,
  redis: { client: redisClient }, // Prevent multiple instances from running
  logger: {
    log: (msg) => logger.info(msg),
    error: (msg) => logger.error(msg),
    debug: (msg) => logger.debug(msg)
  }
});
```

## With Workflow

Clujo works seamlessly with `@ramplex/workflow` for complex task orchestration:

```typescript
import { Clujo } from '@ramplex/clujo';
import { Workflow } from '@ramplex/workflow';

const workflow = new Workflow()
  .addNode({
    id: "fetch",
    execute: async () => {
      const data = await fetchData();
      return data;
    }
  })
  .addNode({
    id: "process",
    dependencies: ["fetch"],
    execute: async (ctx) => {
      const processed = await processData(ctx.fetch);
      return processed;
    }
  })
  .addNode({
    id: "save",
    dependencies: ["process"],
    execute: async (ctx) => {
      await saveResults(ctx.process);
      return { saved: true };
    }
  })
  .build();

const clujo = new Clujo({
  id: "data-pipeline",
  cron: { pattern: "0 */6 * * *" }, // Every 6 hours
  runner: workflow,
  redis: { client: redisClient }
});

clujo.start();
```

# Contributing

Contributions are welcome! Please describe the contribution in an issue before submitting a pull request. Attach the issue number to the pull request description and include tests for new features / bug fixes.

# License

@ramplex/clujo is [MIT](LICENSE) licensed.
