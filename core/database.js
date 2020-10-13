const sqlite3 = require("sqlite3");
const log = require("./log");

class Database {
    constructor(path) {
        log.write(`Connecting to ${path}...`);
        this.database = new sqlite3.Database(path);
    }

    all(query, args, verbose) {
        return new Promise((resolve, reject) => {
            const database = this.database;
            const statement = database.prepare(query, function (err) {
                if (err != null) {
                    if (verbose === true || verbose === undefined) log.write(err);
                    reject(err);
                }
            });
            if (args === undefined || args === null) args = [];
            statement.all(args, function (err, results) {
                statement.finalize();
                if (err != null) {
                    if (verbose === true || verbose === undefined) log.write(err);
                    reject(err);
                } else resolve(results);
            });
        });
    }

    get(query, args, verbose) {
        return new Promise((resolve, reject) => {
            const database = this.database;
            const statement = database.prepare(query, function (err) {
                if (err != null) {
                    if (verbose === true || verbose === undefined) log.write(err);
                    reject(err);
                }
            });
            if (args === undefined || args === null) args = [];
            statement.get(args, function (err, result) {
                statement.finalize();
                if (err != null) {
                    if (verbose === true || verbose === undefined) log.write(err);
                    reject(err);
                } else resolve(result);
            });
        });
    }

    run(query, args, verbose) {
        return new Promise((resolve, reject) => {
            const database = this.database;
            const statement = database.prepare(query, function (err) {
                if (err != null) {
                    if (verbose === true || verbose === undefined) log.write(err);
                    reject(err);
                }
            });
            if (args === undefined || args === null) args = [];
            statement.run(args, function (err) {
                statement.finalize();
                if (err != null) {
                    if (verbose === true || verbose === undefined) log.write(err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

    }

    async runList(queries, args, verbose) {
        let finalResult = true;
        for (let query of queries) {
            let arg;
            if (args && args.length !== 0) arg = args.shift();
            try {
                await this.run(query, arg, verbose)
            } catch {
                finalResult = false;
            }
        }
        if (!finalResult) return Promise.reject("One or more statements failed");
    }
}

module.exports = Database;