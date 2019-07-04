const database = require("./database");
const crypto = require("crypto");

let accountDatabase = new database.Database("./accounts.db");

accountDatabase.run("CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, salt TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, privilege INTEGER NOT NULL DEFAULT 0);");

newAccount("admin", "password", Number.MAX_SAFE_INTEGER);

function accountExists(usernameOrID, enabledCheck, next) {
    let query;
    if (usernameOrID === undefined) {
        if (next !== undefined) next(false);
        return;
    } else if (Number.isInteger(usernameOrID)) {
        query = "SELECT * FROM accounts WHERE id = ?";

    } else {
        query = "SELECT * FROM accounts WHERE lower(username) = ?";
    }
    if (enabledCheck) query += " AND enabled = 1";

    accountDatabase.all(query, usernameOrID, function(result) {
        if (result.length === 1) {
            if (next !== undefined) next(true);
        } else {
            if (next !== undefined) next(false);
        }

    });
}

function getAccountsSummary(next) {
    accountDatabase.all("SELECT id, username, enabled, privilege FROM accounts ORDER BY username COLLATE NOCASE", null,function (results) {
        let resultsById = {};
        for (let result in results) {
            if (results.hasOwnProperty(result)) {
                result = results[result];
                let id = result.id;
                delete result[id];
                resultsById[id] = result;
            }
        }
        if (next != undefined) next(results);
    });
}

function getInformation(select, whereKey, whereValue, next) {
    accountDatabase.get("SELECT " + select + " FROM accounts WHERE " + whereKey + " = ?", whereValue, function(result) {
        if (next !== undefined) next(result[select]);
    });
}


function nextID(next) {
    accountDatabase.get("SELECT * FROM accounts ORDER BY id DESC", null, function(result) {
        if (result !== false) {
            if (next !== undefined) next(result.id + 1);
        } else {
            if (next !== undefined) next(0);
        }
    });
}

function newAccount(username, password, privilege, next) {
    accountExists(username, false, function(result) {
        if (result) {
            if (next !== undefined) next(false);
            return
        }

        let salt = generateSalt();
        let hash = getHash(password, salt);

        nextID(function(id) {
            accountDatabase.run("INSERT INTO accounts (id, username, hash, salt, privilege) VALUES (?, ?, ?, ?, ?)", [id, username, hash, salt, privilege], function(result) {
                if (!result && username !== undefined && password !== undefined && privilege !== undefined) {
                    newAccount(username, password, privilege, next);
                } else if (next !== undefined) next(result);

            })
        });
    });
}

function deleteAccount(id, next) {
    accountExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return
        }

        accountDatabase.run("DELETE FROM accounts WHERE id = ?", id, function(result) {
            if (next !== undefined) next(result);
        });
    });
}

function enableAccount(id, next) {
    accountExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        accountDatabase.run("UPDATE accounts SET enabled = 1 WHERE id = ?", id, function(result) {
            if (next !== undefined) next(result);
        });

    });
}

function disableAccount(id, next) {
    accountExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        accountDatabase.run("UPDATE accounts SET enabled = 0 WHERE id = ?", id, function(result) {
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

        accountExists(newUsername, false, function(result) {
            if (result) {
                if (next !== undefined) next(false);
                return;
            }

            accountDatabase.run("UPDATE accounts SET username = ? WHERE id = ?", [newUsername, id], function(result) {
                if (next !== undefined) next(result);
            });
        });
    });

}

function updatePassword(id, newPassword, next) {
    accountExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        let newSalt = generateSalt();
        let newHash = getHash(newPassword, newSalt);

        accountDatabase.run("UPDATE accounts SET hash = ?, salt = ? WHERE id = ?", [newHash, newSalt, id], function(result) {
            if (next !== undefined) next(result);
        });
    });
}

function updatePrivilege(id, newPrivilege, next) {
    accountExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        accountDatabase.run("UPDATE accounts SET privilege = ? WHERE id = ?", [newPrivilege, id], function(result) {
            if (next !== undefined) next(result);
        });

    });
}

function generateSalt() {
    return crypto.randomBytes(16).toString("hex");
}

function getHash(password, salt) {
    return crypto.createHmac('sha512', salt).update(password).digest('hex');
}

module.exports = {
    accountDatabase: accountDatabase,
    accountExists: accountExists,
    getAccountsSummary: getAccountsSummary,
    getInformation: getInformation,
    newAccount: newAccount,
    deleteAccount: deleteAccount,
    enableAccount: enableAccount,
    disableAccount: disableAccount,
    updateUsername: updateUsername,
    updatePassword: updatePassword,
    updatePrivilege: updatePrivilege,
    getHash: getHash
};