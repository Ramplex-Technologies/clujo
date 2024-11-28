export class TaskError extends Error {
    public id: string;
    public error: Error;

    constructor(id: string, error: Error) {
        super(`Task ${id} failed: ${error.message}`);
        this.id = id;
        this.error = error;
        this.name = "TaskError";
    }
}
