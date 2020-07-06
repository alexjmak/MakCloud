const path = require("path");
const crypto = require("crypto");
const mkdirp = require('mkdirp');
const database = require("./databaseInit");
const log = require("../core/log");
const preferences = require("../preferences");

const checkAccountsTable = ["CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT);",
    "ALTER TABLE accounts ADD COLUMN id INTEGER PRIMARY KEY AUTOINCREMENT;",
    "ALTER TABLE accounts ADD COLUMN username TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE accounts ADD COLUMN hash TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE accounts ADD COLUMN salt TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE accounts ADD COLUMN privilege INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;"];
const checkDeletedAccountsTable = ["CREATE TABLE IF NOT EXISTS deleted_accounts (id INTEGER);",
    "ALTER TABLE deleted_accounts ADD COLUMN id INTEGER;",
    "ALTER TABLE deleted_accounts ADD COLUMN username TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE deleted_accounts ADD COLUMN hash TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE deleted_accounts ADD COLUMN salt TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE deleted_accounts ADD COLUMN privilege INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE deleted_accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;",
    "ALTER TABLE deleted_accounts ADD COLUMN dateDeleted INTEGER NOT NULL DEFAULT 0;"];

database.runList(checkAccountsTable, [], function() {
    newAccount("admin", "password", 100);
    getInformation("id", "username", "admin", function(id) {
        updatePrivilege(id, 100);
    });
}, false);

database.runList(checkDeletedAccountsTable, [], function() {}, false);

function deleteAccount(id, next) {
    idExists(id, false, function(result) {
        getInformation("username", "id", id, function(username) {
            if (!result) {
                if (next !== undefined) next(false);
                return
            }
            let dateDeleted = Math.floor(Date.now() / 1000);
            database.run("INSERT INTO deleted_accounts (id, username, hash, salt, privilege, dateDeleted) SELECT id, username, hash, salt, privilege, " + dateDeleted + " as dateDeleted FROM accounts WHERE id = ?;", id, function() {
                database.get("SELECT * FROM accounts WHERE id = ?", id, function(result) {
                    database.run("DELETE FROM accounts WHERE id = ?", id, function() {
                        next(result);
                    });
                })
            });
        })
    });
}

function deleteDeletedAccount(id, next) {
    database.run("DELETE FROM deleted_accounts WHERE id = ?", id, function (result) {
        if (next !== undefined) next(result);
    });
}

function disableAccount(id, next) {
    idExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        database.run("UPDATE accounts SET enabled = 0 WHERE id = ?", id, function(result) {
            if (next !== undefined) next(result);
        });

    });
}

function enableAccount(id, next) {
    idExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        database.run("UPDATE accounts SET enabled = 1 WHERE id = ?", id, function(result) {
            if (next !== undefined) next(result);
        });

    });
}

function getAccountInfoHash(id, next) {
    database.get("SELECT * FROM accounts WHERE id = ?", id, function(result) {
        let hash = crypto.createHash("md5").update(JSON.stringify(result))
        hash = hash.digest("hex");
        if (next) next(hash);
    });
}

function getAccountsSummary(id, next) {
    getInformation("privilege", "id", id, function(privilege) {
        getInformation("username", "id", id, function(username) {
            database.all("SELECT id, username, privilege, encryptKey NOT NULL AS encrypted, enabled FROM accounts WHERE ? OR id = ? OR privilege < ? ORDER BY username COLLATE NOCASE", [username === "admin", id, privilege], function (results) {
                let resultsById = {};
                for (let result in results) {
                    if (results.hasOwnProperty(result)) {
                        result = results[result];
                        let accountID = result.id;
                        delete result[accountID];
                        resultsById[accountID] = result;
                    }
                }
                if (next !== undefined) next(resultsById);
            });
        });
    });
}

function getDeletedAccountsSummary(id, next) {
    getInformation("privilege", "id", id, function(privilege) {
        getInformation("username", "id", id, function(username) {
            database.all("SELECT id, username, privilege, encryptKey NOT NULL AS encrypted FROM deleted_accounts WHERE ? OR id = ? OR privilege < ? ORDER BY username COLLATE NOCASE", [username === "admin", id, privilege], function (results) {
                let resultsById = {};
                for (let result in results) {
                    if (results.hasOwnProperty(result)) {
                        result = results[result];
                        let accountID = result.id;
                        delete result[accountID];
                        resultsById[accountID] = result;
                    }
                }
                if (next !== undefined) next(resultsById);
            });
        });
    });
}

function getInformation(select, whereKey, whereValue, next) {
    database.get("SELECT " + select + " FROM accounts WHERE " + whereKey + " = ?", whereValue, function(result) {
        if (next !== undefined) next(result[select]);
    });
}

function idExists(id, enabledCheck, next) {
    let query;
    if (id === undefined) {
        if (next !== undefined) next(false);
        return;
    }
    query = "SELECT * FROM accounts WHERE id = ?";
    if (enabledCheck) query += " AND enabled = 1";
    database.all(query, id, function(result) {
        if (result.length === 1) {
            if (next !== undefined) next(true);
        } else {
            if (next !== undefined) next(false);
        }
    });
}

function newAccount(username, password, privilege, next) {
    usernameExists(username, false, function(result) {
        if (result) {
            if (next !== undefined) next(false);
            return
        }

        const authorization = require("./authorization");
        let salt = authorization.generateSalt();
        let hash = authorization.getHash(password, salt);

        let id = newID();
        database.run("INSERT INTO accounts (id, username, hash, salt, privilege) VALUES (?, ?, ?, ?, ?)", [id, username, hash, salt, privilege], function(result) {
            if (!result && username !== undefined && password !== undefined && privilege !== undefined) {
                log.write("Error creating new account. Trying again...");
                newAccount(username, password, privilege, next);
            } else {
                let filePath = path.join(preferences.get("files"), id).toString();
                mkdirp(path.join(filePath, "files")).then(function() {
                    mkdirp(path.join(filePath, "photos")).then(function() {
                        mkdirp(path.join(filePath, "mail")).then(function() {
                            if (next) next(result);
                        });
                    });
                });

            }
        });



    });
}

function newID() {
    return parseInt("" + Date.now() + Math.floor(Math.random() * 100)).toString(36).toUpperCase();
}

function searchAccounts(query, next) {
    database.all("SELECT id, username FROM accounts WHERE username LIKE ?", "%" + query + "%", function (results) {
        let resultsById = {};
        for (let result in results) {
            if (results.hasOwnProperty(result)) {
                result = results[result];
                let id = result.id;
                delete result[id];
                resultsById[id] = result;
            }
        }
        if (next !== undefined) next(results);
    });
}

function updatePassword(id, newPassword, next) {
    idExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        const authorization = require("./authorization");

        let newSalt = authorization.generateSalt();
        let newHash = authorization.getHash(newPassword, newSalt);

        database.run("UPDATE accounts SET hash = ?, salt = ? WHERE id = ?", [newHash, newSalt, id], function(result) {
            if (next !== undefined) next(result);
        });
    });
}

function updatePrivilege(id, newPrivilege, next) {
    if (newPrivilege >= 100) newPrivilege = 100;
    idExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        database.run("UPDATE accounts SET privilege = ? WHERE id = ?", [newPrivilege, id], function(result) {
            if (next !== undefined) next(result);
        });

    });
}

function updateUsername(id, newUsername, next) {
    getInformation("username", "id", id, function(username) {
        if (username === "admin" || newUsername === "admin") {
            if (next !== undefined) next(false);
            return;
        }

        usernameExists(newUsername, false, function(result) {
            if (result) {
                if (next !== undefined) next(false);
                return;
            }

            database.run("UPDATE accounts SET username = ? WHERE id = ?", [newUsername, id], function(result) {
                if (next !== undefined) next(result, username);
            });
        });
    });

}

function usernameExists(username, enabledCheck, next) {
    let query;
    if (username === undefined) {
        if (next !== undefined) next(false);
        return;
    }
    query = "SELECT * FROM accounts WHERE lower(username) = ?";
    if (enabledCheck) query += " AND enabled = 1";
    database.all(query, username, function(result) {
        if (result.length === 1) {
            if (next !== undefined) next(true);
        } else {
            if (next !== undefined) next(false);
        }

    });
}

module.exports = {
    deleteAccount: deleteAccount,
    deleteDeletedAccount: deleteDeletedAccount,
    disableAccount: disableAccount,
    enableAccount: enableAccount,
    getAccountInfoHash: getAccountInfoHash,
    getAccountsSummary: getAccountsSummary,
    getDeletedAccountsSummary: getDeletedAccountsSummary,
    getInformation: getInformation,
    idExists: idExists,
    newAccount: newAccount,
    searchAccounts: searchAccounts,
    updatePassword: updatePassword,
    updatePrivilege: updatePrivilege,
    updateUsername: updateUsername,
    usernameExists: usernameExists
};