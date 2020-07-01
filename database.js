const sqlite3 = require("sqlite3");
const log = require("./log");

class Database {
    constructor(path) {
        this.database = new sqlite3.Database(path);
    }

    run(query, args, next, verbose) {
        let database = this.database;

        var stmt = database.prepare(query, function (err) {
            if (err != null) {
                if (verbose === true || verbose === undefined) log.write(err);
                if (next !== undefined) next(false);
            }
        });

        if (!args) args = [];
        stmt.run(args, function (err) {
            stmt.finalize();
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

    all(query, args, next, verbose) {
        let database = this.database;
        let stmt = database.prepare(query, function (err) {
            if (err != null) {
                if (verbose === true || verbose === undefined) log.write(err);
                if (next !== undefined) next(false);
            }
        });

        if (!args) args = [];

        stmt.all(args, function (err, results) {
            stmt.finalize();

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
        let stmt = database.prepare(query, function (err) {
            if (err != null) {
                if (verbose === true || verbose === undefined) log.write(err);
                if (next !== undefined) next(false);
            }
        });

        if (args == null) args = [];
        stmt.get(args, function (err, result) {
            stmt.finalize();

            if (err != null) {
                if (verbose === true || verbose === undefined) log.write(err);
                if (next !== undefined) next(false);
            } else if (result === undefined) {
                if (next !== undefined) next(false);
            } else if (next !== undefined) next(result);

        });
    }

}

module.exports = Database;