const fs = require("fs");
const mkdirp = require("mkdirp");
const path = require("path");
const rmfr = require("rmfr");

const database = require("./core/databaseInit");
const preferences = require("./preferences");
const log = require("./core/log");
const terminal = require("./core/terminal");

const accountManager = require("./core/accountManager");

async function decryptAccount(id, password) {
    await accountManager.idExists(id, false);
    const encryptKey = await accountManager.getInformation("encryptKey", "id", id);
    if (encryptKey) {
        const encryptionManager = require("./encryptionManager");
        const decryptedKey = await encryptionManager.decryptEncryptionKey(id, password);
        await encryptionManager.decryptAccount(id, decryptedKey);
    }
    await database.run("UPDATE accounts SET encryptKey = null, encryptIV = null, derivedKeySalt = null WHERE id = ?", id);
}

async function deleteAccount(id) {
    const deletedAccountInfo = await accountManager.deleteAccount(id);

    let encryptKey = deletedAccountInfo["encryptKey"]
    let encryptIV = deletedAccountInfo["encryptIV"]
    let derivedKeySalt = deletedAccountInfo["derivedKeySalt"]

    if (encryptKey === undefined) encryptKey = null;
    if (encryptIV === undefined) encryptIV = null;
    if (derivedKeySalt === undefined) derivedKeySalt = null;

    await database.run("UPDATE deleted_accounts SET encryptKey = ?, encryptIV = ?, derivedKeySalt = ? WHERE id = ?",
        [encryptKey, encryptIV, derivedKeySalt, id]);

    const deletedFilesPath = path.join(preferences.get("files"), "deleted");

    const filePath = path.join(preferences.get("files"), id);
    const newFilePath = path.join(deletedFilesPath, id);

    await mkdirp(deletedFilesPath);

    try {
        await fs.promises.rename(filePath, newFilePath);
    } catch {}

    if (preferences.get("sambaIntegration")) {
        const result = await database.get("SELECT username FROM deleted_accounts WHERE id = ?", id);
        if (result) {
            let username = result.username;
            try {
                await fs.promises.unlink(
                    path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase())
                );
            } catch (err) {
                log.write(err.toString());
            }
            await terminal("sudo smbpasswd -x " + username.toLowerCase() +
                "; sudo userdel -r " + username.toLowerCase(), null, false);
        }
    }
}

async function deleteDeletedAccount(id) {
    await accountManager.deleteDeletedAccount(id);
    let directory = path.join(preferences.get("files"), "deleted", id);
    try {
        await rmfr(directory);
    } catch {}
}

async function disableAccount(id) {
    await accountManager.disableAccount(id);
    if (preferences.get("sambaIntegration")) {
        const username = await accountManager.getInformation("username", "id", id);
        try {
            await fs.promises.unlink(
                path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase())
            );
        } catch (err) {
            log.write(err.toString());
        }
        await terminal("sudo smbpasswd -d " + username.toLowerCase(), null, false);
    }
}

async function enableAccount(id) {
    await accountManager.enableAccount(id);
    if (preferences.get("sambaIntegration")) {
        const username = await accountManager.getInformation("username", "id", id);
        try {
            await fs.promises.symlink(
                path.join(__dirname, preferences.get("files"), id),
                path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()),
                "dir"
            );
        } catch (err) {
            log.write(err.toString());
        }
        await terminal("sudo smbpasswd -e " + username.toLowerCase(), null, false);
    }
}

async function encryptAccount(id, password) {
    await setEncryptionInfo(id, password);
    const encryptionManager = require("./encryptionManager");
    const decryptedKey = await encryptionManager.decryptEncryptionKey(id, password);
    await encryptionManager.encryptAccount(id, decryptedKey);
    return decryptedKey;
}

async function getAccountsSummary(id) {
    const privilege = await accountManager.getInformation("privilege", "id", id);
    const username = await accountManager.getInformation("username", "id", id);
    const results = await database.all("SELECT id, username, privilege, enabled, encryptKey NOT NULL AS encrypted FROM accounts WHERE ? OR id = ? OR privilege < ? ORDER BY username COLLATE NOCASE", [username === "admin", id, privilege]);
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

async function newAccount(username, password, privilege, encrypted) {

    await accountManager.newAccount(username, password, privilege);
    const id = await accountManager.getInformation("id", "username", username);

    if (encrypted) {
        await setEncryptionInfo(id, password);
    }

    if (preferences.get("sambaIntegration")) {
        try {
            await fs.promises.symlink(
                path.join(__dirname, preferences.get("files"), id),
                path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()),
                "dir");
        } catch (err) {
            log.write(err.toString());
        }
        await terminal("sudo useradd -G makcloud --no-create-home --no-user-group --system " +
            username.toLowerCase() + "; (echo " + password + "; echo " + password + ") | sudo smbpasswd -a " +
            username.toLowerCase(), null, false);
    }

}

async function setEncryptionInfo(id, password) {
    const encryptionManager = require("./encryptionManager");
    const encryptionInfo = await encryptionManager.generateEncryptionKey(id, password);
    await database.run("UPDATE accounts SET encryptKey = ?, encryptIV = ?, derivedKeySalt = ? WHERE id = ?",
        [encryptionInfo.key, encryptionInfo.iv, encryptionInfo.salt, id]);
}

async function updatePassword(id, newPassword, oldPassword) {
    let iv = await accountManager.getInformation("encryptIV", "id", id);
    if (iv && oldPassword) {
        const encryptionManager = require("./encryptionManager");
        const authorization = require("./authorization");
        let key = await encryptionManager.decryptEncryptionKey(id, oldPassword);
        key = Buffer.from(key, "hex");
        iv = Buffer.from(iv, "hex");
        const derivedKeySalt = authorization.generateSalt();
        const pbkdf2 = await encryptionManager.generatePbkdf2(newPassword, derivedKeySalt);
        const encryptedKey = await encryptionManager.encryptEncryptionKey(key, iv, pbkdf2);
        iv = iv.toString("hex");
        await accountManager.updatePassword(id, newPassword);
        await database.run("UPDATE accounts SET encryptKey = ?,  encryptIV = ?, derivedKeySalt = ? WHERE ID = ?",
            [encryptedKey, iv, derivedKeySalt, id]);
    } else {
        await accountManager.updatePassword(id, newPassword);
    }

    if (preferences.get("sambaIntegration")) {
        const username = await accountManager.getInformation("username", "id", id);
        await terminal("(echo " + newPassword + "; echo " + newPassword + ") | sudo smbpasswd -a " +
            username.toLowerCase(), null, false);
        const enabled = await accountManager.getInformation("enabled", "id", id);
        if (!enabled) {
            await terminal("sudo smbpasswd -d " + username.toLowerCase(), null, false);
        }
    }
}

async function updateUsername(id, newUsername) {
    const oldUsername = await accountManager.updateUsername(id, newUsername);
    if (preferences.get("sambaIntegration")) {
        try {
            await fs.promises.rename(
                path.join(__dirname, preferences.get("files"), "smb", oldUsername.toLowerCase()),
                path.join(__dirname, preferences.get("files"), "smb", newUsername.toLowerCase())
            );
        } catch (err) {
            log.write(err.toString());
        }
        await terminal("sudo smbpasswd -x " + oldUsername.toLowerCase() + "; sudo usermod -l " +
            newUsername.toLowerCase() + " " + oldUsername.toLowerCase(), null, null, false);
    }
}

module.exports = Object.assign({}, accountManager, {
    decryptAccount: decryptAccount,
    deleteAccount: deleteAccount,
    deleteDeletedAccount: deleteDeletedAccount,
    disableAccount: disableAccount,
    enableAccount: enableAccount,
    encryptAccount: encryptAccount,
    getAccountsSummary: getAccountsSummary,
    newAccount: newAccount,
    updatePassword: updatePassword,
    updateUsername: updateUsername,
});