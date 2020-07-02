const sqlite3 = require("sqlite3");
const log = require("./log");

class Database {
    constructor(path) {
        this.database = new sqlite3.Database(path);
    }

    all(query, args, next, verbose) {
        let database = this.database;
        let statement = database.prepare(query, function (err) {
            if (err != null) {
                if (verbose === true || verbose === undefined) log.write(err);
                if (next !== undefined) next(false);
            }
        });

        if (args === undefined || args === null) args = [];

        statement.all(args, function (err, results) {
            statement.finalize();

            if (err != null) {
                if (verbose === true || verbose === undefined) log.write(err);
                if (next !== undefined) next(false);
            } else if (results === undefined) {
                if (next !== undefined) next(false);
            } else if (next !== undefined) next(results);


        });
    }

    get(query, args, next, verbose) {
        let database = this.database;
        let statement = database.prepare(query, function (err) {
            if (err != null) {
                if (verbose === true || verbose === undefined) log.write(err);
                if (next !== undefined) next(false);
            }
        });

        if (args === undefined || args === null) args = [];
        statement.get(args, function (err, result) {
            statement.finalize();

            if (err != null) {
                if (verbose === true || verbose === undefined) log.write(err);
                if (next !== undefined) next(false);
            } else if (result === undefined) {
                if (next !== undefined) next(false);
            } else if (next !== undefined) next(result);

        });
    }

    run(query, args, next, verbose) {
        let database = this.database;

        var statement = database.prepare(query, function (err) {
            if (err != null) {
                if (verbose === true || verbose === undefined) log.write(err);
                if (next !== undefined) next(false);
            }
        });

        if (args === undefined || args === null) args = [];
        statement.run(args, function (err) {
            statement.finalize();
            if (err != null) {
                if (verbose === true || verbose === undefined) log.write(err);
                if (next !== undefined) next(false);
            } else {
                if (next !== undefined) next(true);
            }
        });

    }

    runList(queries, args, next, verbose) {
        let finalResult = true;
        while(queries.length !== 0) {
            let query = queries.shift();
            let arg;
            if (args && args.length !== 0) arg = args.shift();
            this.run(query, arg, function(result) {
                if (!result) finalResult = false;
            }, verbose)
        }
        if (next) next(finalResult);

    }
}

module.exports = Database;