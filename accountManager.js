const fs = require("fs");
const mkdirp = require("mkdirp");
const path = require("path");
const rimraf = require("rimraf");

const database = require("./core/databaseInit");
const preferences = require("./preferences");
const log = require("./core/log");
const terminal = require("./core/terminal");

const accountManager = require("./core/accountManager");

function decryptAccount(id, password, next) {
    accountManager.idExists(id, false, function(result) {
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
                    encryptionManager.decryptAccount(id, decryptedKey, function(err) {
                        if (err) {
                            if (next) next(false);
                            return;
                        }
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

function deleteAccount(id, next) {
    accountManager.deleteAccount(id, function(result) {
        if (result === false) {
            if (next) next(false);
            return;
        }
        let encryptKey = result["encryptKey"]
        let encryptIV = result["encryptIV"]
        let derivedKeySalt = result["derivedKeySalt"]

        if (encryptKey === undefined) encryptKey = null;
        if (encryptIV === undefined) encryptIV = null;
        if (derivedKeySalt === undefined) derivedKeySalt = null;

        database.run("UPDATE deleted_accounts SET encryptKey = ?, encryptIV = ?, derivedKeySalt = ? WHERE id = ?", [encryptKey, encryptIV, derivedKeySalt, id])

        let deletedFilesPath = path.join(preferences.get("files"), "deleted");

        let filePath = path.join(preferences.get("files"), id);
        let newFilePath = path.join(deletedFilesPath, id);

        mkdirp(deletedFilesPath).then(function() {
            fs.rename(filePath, newFilePath, function() {
                next(true);
            });
        })

        if (preferences.get("sambaIntegration")) {
            database.get("SELECT username FROM deleted_accounts WHERE id = ?", id, function(result) {
                if (result) {
                    let username = result.username;
                    try {
                        fs.unlinkSync(path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()));
                    } catch (err) {
                    }

                    terminal("sudo smbpasswd -x " + username.toLowerCase() + "; sudo userdel -r " + username.toLowerCase(), null, null, false);
                }

            });
        }


    })
}

function deleteDeletedAccount(id, next) {
    accountManager.deleteDeletedAccount(id, function(result) {
        if (result === false) {
            if (next) next(false);
            return;
        }
        let directory = path.join(preferences.get("files"), "deleted", id);
        rimraf(directory, function(err) {
            if (err) {
                log.write(err);
                next(false);
            } else next(true);
        });
    });
}

function disableAccount(id, next) {
    accountManager.disableAccount(id, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        if (preferences.get("sambaIntegration")) {
            accountManager.getInformation("username", "id", id, function (username) {
                try {
                    fs.unlinkSync(path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()));
                } catch (err) {
                    log.write(err.toString());
                }
                terminal("sudo smbpasswd -d " + username.toLowerCase(), null, null, false);
            });
        }

        next(true);
    });
}

function enableAccount(id, next) {
    accountManager.enableAccount(id, function(result) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        if (preferences.get("sambaIntegration")) {
            accountManager.getInformation("username", "id", id, function (username) {
                try {
                    fs.symlinkSync(path.join(__dirname, preferences.get("files"), id), path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()), "dir");
                } catch (err) {
                    log.write(err.toString());
                }

                terminal("sudo smbpasswd -e " + username.toLowerCase(), null, null, false);
            });
        }

        next(true);
    });
}

function encryptAccount(id, password, next) {
    accountManager.idExists(id, false, function(result) {
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
                        console.log(decryptedKey)
                        encryptionManager.encryptAccount(id, decryptedKey, function(err) {
                            if (err) {
                                if (next) next(false);
                                return;
                            }
                            if (next) next(true, decryptedKey);
                        })
                    });
                });
            }
        })


    });
}

function newAccount(username, password, privilege, encrypted, next) {
    accountManager.newAccount(username, password, privilege, function (result) {
        if (result === false) {
            if (next) next(false);
            return;
        }

        accountManager.getInformation("id", "username", username, function (id) {
            if (encrypted) {
                encryptAccount(id, password, function () {
                    if (next) next(true);
                });
            } else if (next) next(true);

            if (preferences.get("sambaIntegration")) {
                try {
                    fs.symlinkSync(path.join(__dirname, preferences.get("files"), id), path.join(__dirname, preferences.get("files"), "smb", username.toLowerCase()), "dir");
                } catch (err) {
                    log.write(err.toString());
                }
                terminal("sudo useradd -G makcloud --no-create-home --no-user-group --system " + username.toLowerCase() + "; (echo " + password + "; echo " + password + ") | sudo smbpasswd -a " + username.toLowerCase(), null, null, false);
            }
        });
    });
}

function updatePassword(id, newPassword, oldPassword, next) {
    accountManager.getInformation("encryptIV", "id", id, function(iv) {
        if (iv) {
            if (oldPassword) {
                const encryptionManager = require("./encryptionManager");
                encryptionManager.decryptEncryptionKey(id, oldPassword, function(key) {
                    if (key) {
                        key = Buffer.from(key, "hex");
                        iv = Buffer.from(iv, "hex");
                        const authorization = require("./authorization");
                        let derivedKeySalt = authorization.generateSalt();
                        encryptionManager.generatePbkdf2(newPassword, derivedKeySalt, function(pbkdf2) {
                            encryptionManager.encryptEncryptionKey(key, iv, pbkdf2, function(encryptedKey) {
                                iv = iv.toString("hex");
                                accountManager.updatePassword(id, newPassword, function(result) {
                                    if (result) {
                                        database.run("UPDATE accounts SET encryptKey = ?,  encryptIV = ?, derivedKeySalt = ? WHERE ID = ?", [encryptedKey, iv, derivedKeySalt, id], function(result) {
                                            if (next) next(true);
                                        });
                                    } else {
                                        if (next) next(false);
                                    }
                                });
                            })
                        })
                    } else {
                        if (next) next(false);
                    }
                })
            } else {
                if (next) next(false);
            }
        } else {
            accountManager.updatePassword(id, newPassword, next);
        }

    })

    if (preferences.get("sambaIntegration")) {
        accountManager.getInformation("username", "id", id, function (username) {
            terminal("(echo " + newPassword + "; echo " + newPassword + ") | sudo smbpasswd -a " + username.toLowerCase(), null, null, false);
            accountManager.getInformation("enabled", "id", id, function (enabled) {
                if (!enabled) {
                    terminal("sudo smbpasswd -d " + username.toLowerCase(), null, null, false);
                }
            });
        });
    }
}

function updateUsername(id, newUsername, next) {
    accountManager.updateUsername(id, newUsername, function(result, oldUsername) {
        if (!result) {
            if (next !== undefined) next(false);
            return;
        }

        if (preferences.get("sambaIntegration")) {
            try {
                fs.renameSync(path.join(__dirname, preferences.get("files"), "smb", oldUsername.toLowerCase()), path.join(__dirname, preferences.get("files"), "smb", newUsername.toLowerCase()));
            } catch (err) {
                log.write(err.toString());
            }
            terminal("sudo smbpasswd -x " + oldUsername.toLowerCase() + "; sudo usermod -l " + newUsername.toLowerCase() + " " + oldUsername.toLowerCase(), null, null, false);
        }

        next(true);
    });

}

module.exports = Object.assign({}, accountManager, {
    decryptAccount: decryptAccount,
    deleteAccount: deleteAccount,
    deleteDeletedAccount: deleteDeletedAccount,
    disableAccount: disableAccount,
    enableAccount: enableAccount,
    encryptAccount: encryptAccount,
    newAccount: newAccount,
    updatePassword: updatePassword,
    updateUsername: updateUsername,

});