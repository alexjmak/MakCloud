const sqlite3 = require("sqlite3");

class Database {

    constructor(path) {
        this.database = new sqlite3.Database(path);
    }


    run(query, args, next) {
        let database = this.database;

        var stmt = database.prepare(query, function (err) {
            if (err != null) {
                console.log(err);
                if (next != undefined) next(false);
            }
        });

        if (args == null) args = [];
        stmt.run(args, function (err) {
            stmt.finalize();
            if (err != null) {
                console.log(err);
                if (next != undefined) next(false);
            } else {
                if (next != undefined) next(true);
            }
        });

    }

    all(query, args, next) {
        let database = this.database;
        let stmt = database.prepare(query, function (err) {
            if (err != null) {
                console.log(err);
                if (next != undefined) next(false);
            }
        });

        if (args == null) args = [];

        stmt.all(args, function (err, results) {
            stmt.finalize();

            if (err != null) {
                console.log(err);
                if (next != undefined) next(false);
            } else if (results === undefined) {
                if (next != undefined) next(false);
            } else if (next != undefined) next(results);


        });
    }

    get(query, args, next) {
        let database = this.database;
        let stmt = database.prepare(query, function (err) {
            if (err != null) {
                console.log(err);
                if (next != undefined) next(false);
            }
        });

        if (args == null) args = [];
        stmt.get(args, function (err, result) {
            stmt.finalize();

            if (err != null) {
                console.log(err);
                if (next != undefined) next(false);
            } else if (result === undefined) {
                if (next != undefined) next(false);
            } else if (next != undefined) next(result);

        });
    }

}

module.exports = {
    Database: Database
};