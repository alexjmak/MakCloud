const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pbkdf2 = require('pbkdf2');
const rimraf = require("rimraf");
const database = require("./databaseInit");
const child_process = require('child_process');
const preferences = require("./preferences");
const log = require("./log");

const checkAccountsTable = ["CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY);",
    "ALTER TABLE accounts ADD COLUMN id INTEGER PRIMARY KEY;",
    "ALTER TABLE accounts ADD COLUMN username TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE accounts ADD COLUMN hash TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE accounts ADD COLUMN salt TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE accounts ADD COLUMN privilege INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE accounts ADD COLUMN encryptKey TEXT;",
    "ALTER TABLE accounts ADD COLUMN encryptIV TEXT;",
    "ALTER TABLE accounts ADD COLUMN derivedKeySalt TEXT;",
    "ALTER TABLE accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;"];

const checkDeletedAccountsTable = ["CREATE TABLE IF NOT EXISTS deleted_accounts (id INTEGER);",
    "ALTER TABLE deleted_accounts ADD COLUMN id INTEGER;",
    "ALTER TABLE deleted_accounts ADD COLUMN username TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE deleted_accounts ADD COLUMN hash TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE deleted_accounts ADD COLUMN salt TEXT NOT NULL DEFAULT ' ';",
    "ALTER TABLE deleted_accounts ADD COLUMN privilege INTEGER NOT NULL DEFAULT ' ';",
    "ALTER TABLE deleted_accounts ADD COLUMN dateDeleted INTEGER NOT NULL DEFAULT ' ';",
    "ALTER TABLE deleted_accounts ADD COLUMN encryptKey TEXT;",
    "ALTER TABLE deleted_accounts ADD COLUMN encryptIV TEXT;",
    "ALTER TABLE deleted_accounts ADD COLUMN derivedKeySalt TEXT;"];

database.runList(checkAccountsTable, [], function() {
    newAccount("admin", "password", 100, false);
    getInformation("id", "username", "admin", function(id) {
        updatePrivilege(id, 100);
    });
}, false);

database.runList(checkDeletedAccountsTable, [], function() {}, false);

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

    database.all(query, usernameOrID, function(result) {
        if (result.length === 1) {
            if (next !== undefined) next(true);
        } else {
            if (next !== undefined) next(false);
        }

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

function getAccountInfoHash(id, next) {
    database.get("SELECT * FROM accounts WHERE id = ?", id, function(result) {
        let hash = crypto.createHash("md5").update(JSON.stringify(result))
        hash = hash.digest("hex");
        if (next) next(hash);
    });
}

function getInformation(select, whereKey, whereValue, next) {
    database.get("SELECT " + select + " FROM accounts WHERE " + whereKey + " = ?", whereValue, function(result) {
        if (next !== undefined) next(result[select]);
    });
}

function nextID(next) {
    database.get("SELECT max(id) as id FROM (SELECT id FROM accounts UNION SELECT id FROM deleted_accounts);", null, function(result) {
        if (result.id !== null) {
            if (next !== undefined) next(result.id + 1);
        } else {
            if (next !== undefined) next(0);
        }
    });
}

function newAccount(username, password, privilege, encrypted, next) {
    accountExists(username, false, function(result) {
        if (result) {
            if (next !== undefined) next(false);
            return
        }

        const authorization = require("./authorization");
        let salt = authorization.generateSalt();
        let hash = authorization.getHash(password, salt);

        nextID(function(id) {
            let filePath = path.join(preferences.get("files"), id.toString()).toString();
            fs.stat(filePath, function(err) {
                if (err != null) {
                    fs.mkdir(filePath, function() {
                        if (preferences.get("sambaIntegration")) {
                            try {
                                fs.symlinkSync(path.join(__dirname, preferences.get("files"), id.toString()), path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()), "dir");
                            } catch (err) {
                                log.write(err.toString());
                            }
                            child_process.exec("sudo useradd -G makcloud --no-create-home --no-user-group --system " + username.toLowerCase() + "; (echo " + password + "; echo " + password + ") | sudo smbpasswd -a " + username.toLowerCase(), function (err, stdout, stderr) {
                                    if (stderr !== "") log.write(stderr);
                            });
                        }
                        fs.mkdirSync(path.join(filePath, "files"));
                        fs.mkdirSync(path.join(filePath, "photos"));
                    });
                }
            });

            database.run("INSERT INTO accounts (id, username, hash, salt, privilege) VALUES (?, ?, ?, ?, ?)", [id, username, hash, salt, privilege], function(result) {
                if (!result && username !== undefined && password !== undefined && privilege !== undefined) {
                    newAccount(username, password, privilege, encrypted, next);
                } else {
                    if (encrypted) {
                        encryptAccount(id, password, function() {
                            if (next !== undefined) next(result);
                        })
                    } else if (next !== undefined) next(result);
                }

            });
        });

    });
}

function deleteAccount(id, next) {
    accountExists(id, false, function(result) {
        getInformation("username", "id", id, function(username) {
            if (!result) {
                if (next !== undefined) next(false);
                return
            }
            let dateDeleted = Math.floor(Date.now()/1000);
            let filePath = path.join(preferences.get("files"), id.toString()).toString();
            let newFilePath = path.join(preferences.get("files"), "deleted", id.toString()).toString();
            fs.rename(filePath, newFilePath, function() {
                database.run("INSERT INTO deleted_accounts SELECT id, username, hash, salt, privilege, " + dateDeleted + " as dateDeleted, encryptKey, encryptIV, derivedKeySalt FROM accounts WHERE id = ?;", id);

                if (preferences.get("sambaIntegration")) {
                    try {
                        fs.unlinkSync(path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()).toString());
                    } catch (err) {
                    }
                    child_process.exec("sudo smbpasswd -x " + username.toLowerCase() + "; sudo userdel -r " + username.toLowerCase(), function (err, stdout, stderr) {
                        if (stderr !== "") log.write(stderr);
                    });
                }

                database.run("DELETE FROM accounts WHERE id = ?", id, function (result) {
                    if (next !== undefined) next(result);
                });
            });
        })
    });
}

function deleteDeletedAccount(id, next) {
    let directory = path.join(preferences.get("files"), "deleted", id.toString()).toString();
    rimraf(directory, function(err) {
        database.run("DELETE FROM deleted_accounts WHERE id = ?", id, function (result) {
            if (next !== undefined) next(result);
        });
    });


}

function encryptAccount(id, password, next) {
    accountExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        const encryptionManager = require("./encryptionManager");
        encryptionManager.generateEncryptionKey(id, password, function(key, iv, salt) {
            if (key === false) {
                if (next !== undefined) next(false);
            } else {
                database.run("UPDATE accounts SET encryptKey = ?, encryptIV = ?, derivedKeySalt = ? WHERE id = ?", [key, iv, salt, id], function(result) {
                    encryptionManager.decryptEncryptionKey(id, password, function(decryptedKey) {
                        encryptionManager.encryptAccount(id, decryptedKey, iv,function() {
                            if (next !== undefined) next(result, decryptedKey, iv);
                        })
                    });
                });
            }
        })


    });
}

function decryptAccount(id, password, next) {
    accountExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }


        let deleteEncryptionInfo = function(next) {
            database.run("UPDATE accounts SET encryptKey = null, encryptIV = null, derivedKeySalt = null WHERE id = ?", id, function(result) {
                if (next !== undefined) next(result);
            });
        }

        database.get("SELECT encryptIV FROM accounts WHERE id = ?", id, function(result) {
            if (result) {
                let iv = result["encryptIV"];
                const encryptionManager = require("./encryptionManager");
                encryptionManager.decryptEncryptionKey(id, password, function(decryptedKey) {
                    encryptionManager.decryptAccount(id, decryptedKey, iv, function() {
                        deleteEncryptionInfo(function(result) {
                            if (next !== undefined) next(result);
                        });
                    });
                });
            } else {
                deleteEncryptionInfo(function(result) {
                    if (next !== undefined) next(result);
                })
            }

        })

    });
}

function enableAccount(id, next) {
    accountExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        if (preferences.get("sambaIntegration")) {
            getInformation("username", "id", id, function (username) {
                try {
                    fs.symlinkSync(path.join(__dirname, preferences.get("files"), id.toString()), path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()), "dir");
                } catch (err) {
                    log.write(err.toString());
                }

                child_process.exec("sudo smbpasswd -e " + username.toLowerCase(), function (err, stdout, stderr) {
                    if (stderr !== "") log.write(stderr);
                });
            });
        }

        database.run("UPDATE accounts SET enabled = 1 WHERE id = ?", id, function(result) {
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

        if (preferences.get("sambaIntegration")) {
            getInformation("username", "id", id, function (username) {
                try {
                    fs.unlinkSync(path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()).toString());
                } catch (err) {
                    log.write(err.toString());
                }
                child_process.exec("sudo smbpasswd -d " + username.toLowerCase(), function (err, stdout, stderr) {
                    if (stderr !== "") log.write(stderr);
                });
            });
        }

        database.run("UPDATE accounts SET enabled = 0 WHERE id = ?", id, function(result) {
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

            if (preferences.get("sambaIntegration")) {
                try {
                    fs.renameSync(path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()).toString(), path.join(__dirname, preferences.get("files"), "smb", newUsername.toLowerCase()).toString());
                } catch (err) {
                    log.write(err.toString());
                }
                child_process.exec("sudo smbpasswd -x " + username.toLowerCase() + "; sudo usermod -l " + newUsername.toLowerCase() + " " + username.toLowerCase(), function (err, stdout, stderr) {
                    if (stderr !== "") log.write(stderr);
                });
            }

            database.run("UPDATE accounts SET username = ? WHERE id = ?", [newUsername, id], function(result) {
                if (next !== undefined) next(result);
            });
        });
    });

}

function updatePassword(id, newPassword, oldPassword, next) {
    accountExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        const authorization = require("./authorization");

        let newSalt = authorization.generateSalt();
        let newHash = authorization.getHash(newPassword, newSalt);

        let updateDatabase = function() {
            if (preferences.get("sambaIntegration")) {
                getInformation("username", "id", id, function (username) {
                    child_process.exec("(echo " + newPassword + "; echo " + newPassword + ") | sudo smbpasswd -a " + username.toLowerCase(), function (err, stdout, stderr) {
                        if (stderr !== "") log.write(stderr);
                    });
                    getInformation("enabled", "id", id, function (enabled) {
                        if (!enabled) {
                            child_process.exec("sudo smbpasswd -d " + username.toLowerCase(), function (err, stdout, stderr) {
                                if (stderr !== "") log.write(stderr);
                            });
                        }
                    });
                });
            }

            database.run("UPDATE accounts SET hash = ?, salt = ? WHERE id = ?", [newHash, newSalt, id], function(result) {
                if (next !== undefined) next(result);
            });
        }

        getInformation("encryptIV", "id", id, function(iv) {
            if (iv) {
                if (oldPassword) {
                    const encryptionManager = require("./encryptionManager");
                    encryptionManager.decryptEncryptionKey(id, oldPassword, function(key) {
                        key = Buffer.from(key, "hex");
                        iv = Buffer.from(iv, "hex");
                        let derivedKeySalt = authorization.generateSalt();
                        encryptionManager.generatePbkdf2(newPassword, derivedKeySalt, function(pbkdf2) {
                            encryptionManager.encryptEncryptionKey(key, iv, pbkdf2, function(encryptedKey) {
                                iv = iv.toString("hex");
                                database.run("UPDATE accounts SET encryptKey = ?,  encryptIV = ?, derivedKeySalt = ? WHERE ID = ?", [encryptedKey, iv, derivedKeySalt, id], function(result) {
                                    updateDatabase();
                                });

                            })
                        })

                    })
                } else {
                    if (next) next(false);
                }
            } else {
                updateDatabase();
            }
        })

    });
}

function updatePrivilege(id, newPrivilege, next) {
    if (newPrivilege >= 100) newPrivilege = 100;
    accountExists(id, false, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        database.run("UPDATE accounts SET privilege = ? WHERE id = ?", [newPrivilege, id], function(result) {
            if (next !== undefined) next(result);
        });

    });
}

module.exports = {
    accountExists: accountExists,
    getAccountsSummary: getAccountsSummary,
    getDeletedAccountsSummary: getDeletedAccountsSummary,
    searchAccounts: searchAccounts,
    getAccountInfoHash: getAccountInfoHash,
    getInformation: getInformation,
    newAccount: newAccount,
    encryptAccount: encryptAccount,
    decryptAccount: decryptAccount,
    deleteAccount: deleteAccount,
    deleteDeletedAccount: deleteDeletedAccount,
    enableAccount: enableAccount,
    disableAccount: disableAccount,
    updateUsername: updateUsername,
    updatePassword: updatePassword,
    updatePrivilege: updatePrivilege,
};