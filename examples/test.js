const util = require("node:util");
const { TaskGraph, Clujo } = require("clujo");

const sleep = util.promisify(setTimeout);

const tasks = new TaskGraph({
    contextFactory: () => 10
})
    .addTask({
        id: "task1",
        execute: async ({ deps, ctx }) => {
            console.debug("Task 1 executing");
            await sleep(5000);
            console.debug("Task 1", deps, ctx);
            console.debug("Task 1 executed");
            return "Task 1 result";
        },
        dependencies: [],
    })
    .addTask({
        id: "task2",
        execute: async ({ deps, ctx }) => {
            console.debug("Task 2 executing");
            await sleep(500);
            console.log("Task 2", deps, ctx);
            console.debug("Task 2 executed");
            return "Task 2 result";
        },
        dependencies: [],
    })
    .addTask({
        id: "task3",
        execute: async ({ deps, ctx }) => {
            console.debug("Task 3 executing");
            await sleep(5000);
            console.log("Task 3", deps, ctx);
            console.debug("Task 3 executed");
            return "Task 3 result";
        },
        dependencies: ["task2"],
    })
    .addTask({
        id: "task4",
        execute: ({ deps, ctx }) => {
            console.debug("Task 4 executing");
            console.log("Task 4", deps, ctx);
            console.debug("Task 4 executed");
            return "Task 4 result";
        },
        dependencies: ["task1"],
    })
    .build();

const clujo = new Clujo({
    id: "test",
    cron: {
        // every 10 seconds cron pattern
        pattern: "*/5 * * * * *",
    },
    taskGraphRunner: tasks,
});

// Immediate trigger
clujo.trigger().then((value) => {
    console.log(value);
});

// start cron
clujo.start();
