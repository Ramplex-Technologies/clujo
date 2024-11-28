declare class TaskError extends Error {
    id: string;
    error: Error;
    constructor(id: string, error: Error);
}

export { TaskError };
