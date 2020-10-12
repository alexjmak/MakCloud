const crypto = require("crypto");
const database = require("./databaseInit");
const log = require("../core/log");

const checkAccountsTable = [
    "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY NOT NULL DEFAULT '');",
    "ALTER TABLE accounts ADD COLUMN id TEXT PRIMARY KEY NOT NULL DEFAULT '';",
    "ALTER TABLE accounts ADD COLUMN username TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE accounts ADD COLUMN hash TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE accounts ADD COLUMN salt TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE accounts ADD COLUMN privilege INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;"
];

const checkDeletedAccountsTable = [
    "CREATE TABLE IF NOT EXISTS deleted_accounts (id TEXT NOT NULL DEFAULT '');",
    "ALTER TABLE deleted_accounts ADD COLUMN id TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE deleted_accounts ADD COLUMN username TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE deleted_accounts ADD COLUMN hash TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE deleted_accounts ADD COLUMN salt TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE deleted_accounts ADD COLUMN privilege INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE deleted_accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;",
    "ALTER TABLE deleted_accounts ADD COLUMN dateDeleted INTEGER NOT NULL DEFAULT 0;"
];

(async () => {
    try {
        await database.runList(checkAccountsTable, [], false);
    } catch {}
    try {
        await database.runList(checkDeletedAccountsTable, [], false);
    } catch {}
    try {
        await newAccount("admin", "password", 100);
    } catch {
    }
})();

async function deleteAccount(id) {
    const dateDeleted = Math.floor(Date.now() / 1000);
    await database.run("INSERT INTO deleted_accounts (id, username, hash, salt, privilege, enabled, dateDeleted) SELECT id, username, hash, salt, privilege, enabled, " + dateDeleted + " as dateDeleted FROM accounts WHERE id = ?;", id)
    const result = await database.get("SELECT * FROM accounts WHERE id = ?", id);
    await database.run("DELETE FROM accounts WHERE id = ?", id);
    return result;
}

function deleteDeletedAccount(id) {
    return database.run("DELETE FROM deleted_accounts WHERE id = ?", id);
}

function disableAccount(id) {
    return database.run("UPDATE accounts SET enabled = 0 WHERE id = ?", id);
}

function enableAccount(id) {
    return database.run("UPDATE accounts SET enabled = 1 WHERE id = ?", id);
}

async function getAccountInfoHash(id) {
    const result = await database.get("SELECT * FROM accounts WHERE id = ?", id);
    let hash = crypto.createHash("md5").update(JSON.stringify(result))
    hash = hash.digest("hex");
    return hash;
}

async function getAccountsSummary(id) {
    const privilege = await getInformation("privilege", "id", id);
    const username = await getInformation("username", "id", id);
    const results = await database.all("SELECT id, username, privilege, enabled FROM accounts WHERE ? OR id = ? OR privilege < ? ORDER BY username COLLATE NOCASE", [username === "admin", id, privilege]);
    const resultsById = {};
    for (let result in results) {
        if (results.hasOwnProperty(result)) {
            result = results[result];
            const accountID = result.id;
            delete result[accountID];
            resultsById[accountID] = result;
        }
    }
    return resultsById;
}

async function getDeletedAccountsSummary(id) {
    const privilege = await getInformation("privilege", "id", id);
    const username = await getInformation("username", "id", id);
    const results = await database.all("SELECT id, username, privilege, enabled FROM deleted_accounts WHERE ? OR id = ? OR privilege < ? ORDER BY username COLLATE NOCASE", [username === "admin", id, privilege]);
    const resultsById = {};
    for (let result in results) {
        if (results.hasOwnProperty(result)) {
            result = results[result];
            const accountID = result.id;
            delete result[accountID];
            resultsById[accountID] = result;
        }
    }
    return resultsById;
}

async function getInformation(select, whereKey, whereValue) {
    const result = await database.get("SELECT " + select + " FROM accounts WHERE " + whereKey + " = ?", whereValue);
    if (result && result.hasOwnProperty(select)) return result[select];
}

async function idExists(id, enabledCheck, next) {
    let query;
    if (!id) return false;
    query = "SELECT * FROM accounts WHERE id = ?";
    if (enabledCheck) query += " AND enabled = 1";

    try {
        const result = await database.all(query, id);
        if (result.length === 1) return true;
    } catch {
    }
    return false;
}

async function newAccount(username, password, privilege) {
    const exists = await usernameExists(username, false);
    if (exists) return Promise.reject("Account exists already");

    const authorization = require("./authorization");
    const salt = authorization.generateSalt();
    const hash = authorization.getHash(password, salt);

    const id = newID();
    try {
        await database.run("INSERT INTO accounts (id, username, hash, salt, privilege) VALUES (?, ?, ?, ?, ?)",
            [id, username, hash, salt, privilege]);
        return id;
    } catch {
        if (username !== undefined && password !== undefined && privilege !== undefined) {
            log.write("Error creating new account. Trying again...");
            return await newAccount(username, password, privilege);
        } else {
            return Promise.reject("Username, password, or privilege undefined");
        }
    }
}

function newID() {
    return parseInt("" + Date.now() + Math.floor(Math.random() * (100 - 10) + 10)).toString(36).toUpperCase();
}

function searchAccounts(query) {
    return database.all("SELECT id, username FROM accounts WHERE username LIKE ?", "%" + query + "%");
}

async function updatePassword(id, newPassword, old_password) {
    const authorization = require("./authorization");

    if (old_password) {
        const loginResult = await authorization.checkPassword(id, old_password)
        if (loginResult === authorization.LOGIN.FAIL) {
            return Promise.reject("Incorrect password")
        }
    }

    const newSalt = authorization.generateSalt();
    const newHash = authorization.getHash(newPassword, newSalt);

    return await database.run("UPDATE accounts SET hash = ?, salt = ? WHERE id = ?", [newHash, newSalt, id]);
}

function updatePrivilege(id, newPrivilege) {
    if (newPrivilege >= 100) newPrivilege = 100;
    return database.run("UPDATE accounts SET privilege = ? WHERE id = ?", [newPrivilege, id]);
}

async function updateUsername(id, newUsername) {
    const username = await getInformation("username", "id", id);
    if (username === "admin" || newUsername === "admin") {
        return Promise.reject("Cannot change the admin username");
    }

    const exists = await usernameExists(newUsername, false);

    if (exists) {
        return Promise.reject("Account exists already");
    }

    await database.run("UPDATE accounts SET username = ? WHERE id = ?", [newUsername, id]);
    return username;

}

async function usernameExists(username, enabledCheck) {
    let query;
    if (!username) {
        return Promise.reject("Username is undefined");
    }
    query = "SELECT * FROM accounts WHERE lower(username) = ?";
    if (enabledCheck) query += " AND enabled = 1";
    try {
        const result = await database.all(query, username);
        if (result.length === 1) {
            return true;
        }
    } catch {}
    return false;
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