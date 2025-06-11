"use strict"

const util = require("node:util");
const { Clujo } = require("@ramplex/clujo");

const sleep = util.promisify(setTimeout);

// Example 1: Simple counter
let counter = 0;
const counterRunner = {
    trigger: async () => {
        counter++;
        console.log(`Counter is now: ${counter}`);
        return { count: counter, timestamp: new Date() };
    }
};

// Example 2: Simulated data processing
const dataProcessor = {
    trigger: async () => {
        console.log("Starting data processing...");
        
        // Simulate fetching data
        await sleep(100);
        const data = { users: 100, orders: 250 };
        console.log("Data fetched:", data);
        
        // Simulate processing
        await sleep(100);
        const processed = { 
            ...data, 
            processed: true, 
            timestamp: new Date() 
        };
        console.log("Data processed:", processed);
        
        return processed;
    }
};

// Create Clujo instances
const counterClujo = new Clujo({
    id: "counter-job",
    cron: {
        // every 10 seconds
        pattern: "*/10 * * * * *",
    },
    runner: counterRunner,
    runOnStartup: true,
});

const processorClujo = new Clujo({
    id: "processor-job",
    cron: {
        // every 30 seconds
        pattern: "*/30 * * * * *",
    },
    runner: dataProcessor,
    runOnStartup: false,
});

// Start the jobs
counterClujo.start();
processorClujo.start();

// Manual trigger example
processorClujo.trigger().then((value) => {
    console.log("Manual trigger result:", value);
});

// Stop after 2 minutes
setTimeout(async () => {
    console.log("Stopping all jobs...");
    await counterClujo.stop();
    await processorClujo.stop();
    console.log("All jobs stopped.");
    process.exit(0);
}, 120000);
