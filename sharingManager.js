const database = require("./databaseInit");
const authorization = require("./authorization");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_FILES_LOCATION = "./files";

database.run("CREATE TABLE IF NOT EXISTS sharing (key TEXT NOT NULL, id INTEGER NOT NULL, access INTEGER NOT NULL DEFAULT 0, expiration INTEGER DEFAULT NULL, UNIQUE(key, id));", [], function () {
    database.run("CREATE TABLE IF NOT EXISTS links (parent TEXT NOT NULL, fileName TEXT NOT NULL, owner INTEGER NOT NULL, key TEXT NOT NULL UNIQUE, hash TEXT DEFAULT NULL, salt TEXT DEFAULT NULL, UNIQUE(parent, fileName, owner));", [], function() {
        database.run("DELETE FROM sharing WHERE key NOT IN (SELECT key FROM links);");
    });
});

function linkCheck(key, filePath, currentID, next) {
    if (currentID === undefined) currentID = -1;
    if (filePath.indexOf("/") !== -1) filePath = filePath.substring(0, filePath.indexOf("/"));

    database.get("SELECT * FROM links WHERE key = ? AND fileName = ?", [key, filePath], function(result) {
        if (result !== false) {
            database.get("SELECT * FROM sharing WHERE key = ? AND (id = ? OR id = -1) AND access > 0 AND (expiration > ? OR expiration IS NULL)", [key, currentID, Date.now()/1000], function(result) {
                if (result !== false) {
                    if (next !== undefined) next(true);
                } else {
                    if (next !== undefined) next(403);
                }
            });
        } else {
            if (next !== undefined) next(404);
        }
    });
}

function linkExists(parent, fileName, owner, next) {
    database.get("SELECT * FROM links WHERE parent = ? AND fileName = ? AND owner = ?", [parent, fileName, owner], function(result) {
        if (result !== false) {
            if (next !== undefined) next(true);
        } else {
            if (next !== undefined) next(false);
        }
    });
}

function deleteLink(parent, fileName, owner, next) {
    database.run("DELETE FROM links WHERE parent = ? AND fileName = ? AND owner = ?", [parent, fileName, owner], function (result) {
        database.run("DELETE FROM sharing WHERE key NOT IN (SELECT key FROM links);");
        if (next !== undefined) next(result);
    });
}

function createLink(parent, fileName, owner, options, next) {
    let key = generateKey();

    owner = Number(owner);

    linkExists(parent, fileName, owner, function(exists) {
        if (!exists) {

            if (options.password === undefined || options.password === null) {
                options.hash = null;
                options.salt = null;
            } else {
                options.salt = authorization.generateSalt();
                options.hash = authorization.getHash(options.password, options.salt);
            }

            database.run("INSERT INTO links (parent, fileName, owner, key, hash, salt) VALUES (?, ?, ?, ?, ?, ?)", [parent, fileName, owner, key, options.hash, options.salt], function(result) {
                if (next !== undefined) {
                    if (next !== false) {
                        let link = "/" + ["shared", key, fileName].join("/");
                        next(link);
                    } else {
                        next(false);
                    }
                }
            });
        } else if (next !== undefined) next(false);
    });
}

function getLinkKey(parent, fileName, owner, next) {
    database.get("SELECT key FROM links WHERE parent = ? AND fileName = ? AND owner = ?;", [parent, fileName, owner], function(result) {
        if (result !== false) {
            if (next !== undefined) next(result.key);
        } else {
            if (next !== undefined) next(false);
        }

    });
}

function linkAccessExists(key, id, next) {
    if (id === undefined) id = -1;
    else id = Number(id);

    database.get("SELECT * FROM sharing WHERE key = ? AND id = ?", [key, id], function(result) {
        if (next !== undefined) {
            if (result !== false) next(true);
            else next(false);
        }
    })
}

function addLinkAccess(parent, fileName, owner, id, access, expiration, next) {
    getLinkKey(parent, fileName, owner, function(key) {
        linkAccessExists(key, id, function (exists) {
            if (!exists) {
                if (id === undefined) id = -1;
                else id = Number(id);

                database.run("INSERT INTO sharing (key, id, access, expiration) VALUES (?, ?, ?, ?)", [key, id, access, expiration], function (result) {
                    if (next !== undefined) next(result);
                });
            } else {
                updateLinkAccess(key, id, access, expiration, next);
            }
        });
    });
}

function updateLinkAccess(key, id, newAccess, newExpiration, next) {
    if (newAccess !== null) {
        database.run("UPDATE sharing SET access = ? WHERE key = ? AND id = ?", [newAccess, key, id], function (accessResult) {
            if (newExpiration !== null) {
                database.run("UPDATE sharing SET expiration = ? WHERE key = ? AND id = ?", [newExpiration, key, id], function(expirationResult) {
                    if (next !== undefined) next(accessResult && expirationResult);
                });
            } else {
                if (next !== undefined) next(accessResult);
            }
        });
    } else if (newExpiration !== null) {
        database.run("UPDATE sharing SET expiration = ? WHERE key = ? AND id = ?", [newExpiration, key, id], function(expirationResult) {
            if (next !== undefined) next(expirationResult)
        });
    }

}

function updateLinkPassword(parent, fileName, owner, newPassword, next) {
    let salt = authorization.generateSalt();
    let hash = authorization.getHash(newPassword, salt);

    database.run("UPDATE links SET hash = ?, salt = ? WHERE parent = ? AND fileName = ? AND owner = ?", [hash, salt, parent, fileName, owner], function (result) {
        if (next !== undefined) next(result);
    });
}

function deleteLinkPassword(parent, fileName, owner, next) {
    database.run("UPDATE links SET hash = ?, salt = ? WHERE parent = ? AND fileName = ? AND owner = ?", [null, null, parent, fileName, owner], function (result) {
        if (next !== undefined) next(result);
    });
}

function getLinkSummary(parent, fileName, owner, next) {
    let linkSummary = {};
    getLinkKey(parent, fileName, owner, function(key)  {
        if (key !== false){
            linkSummary["link"] = "/" + ["shared", key, fileName].join("/");
            getLinkInformation("hash", "key", key, function(hash) {
                linkSummary["passwordEnabled"] = (hash !== null && hash !== undefined);
                database.all("SELECT username, id, access, expiration FROM (SELECT username, sharing.id, access, expiration FROM sharing JOIN accounts ON (sharing.id = accounts.id) WHERE key = ? UNION SELECT username, sharing.id, access, expiration FROM sharing JOIN deleted_accounts ON (sharing.id = deleted_accounts.id) WHERE key = ? UNION SELECT null, id, access, expiration FROM sharing WHERE key = ? AND id = -1);", [key, key, key], function(sharing) {
                    linkSummary["sharing"] = sharing;
                    if(next !== undefined) next(linkSummary);
                });
            });
        } else {
            if(next !== undefined) next(null);
        }

    })
}

function getLinkInformation(select, whereKey, whereValue, next) {
    database.get("SELECT " + select + " FROM links WHERE " + whereKey + " = ?", whereValue, function(result) {
        if (next !== undefined) next(result[select]);
    });
}

function getSharingInformation(select, whereKey, whereValue, next) {
    database.get("SELECT " + select + " FROM sharing WHERE " + whereKey + " = ?", whereValue, function(result) {
        if (next !== undefined) next(result[select]);
    });
}

function getRealFilePath(parent, fileName, owner) {
    return path.join(DEFAULT_FILES_LOCATION, owner.toString(), parent, fileName);
}

function getRealFilePathLink(key, fileName, next) {
    let searchFileName = (fileName.indexOf("/") === -1) ? fileName : fileName.substring(0, fileName.indexOf("/"));
    database.get("SELECT parent, owner FROM links WHERE key = ? AND fileName = ?", [key, searchFileName], function(result) {
        if (next !== undefined) {
            next(getRealFilePath(result.parent, fileName, result.owner));
        }
    });
}

function doAuthorization(key, fileName, req, res, next) {
    if (fileName.indexOf("/") !== -1) fileName = fileName.substring(0, fileName.indexOf("/"));

    let currentID = authorization.getLoginTokenAudience(req);
    if (currentID === undefined) currentID = -1;

    database.get("SELECT sharing.key, id, owner FROM sharing JOIN links ON sharing.key = links.key WHERE sharing.key = ? AND ((id >= 0 AND id = ?) OR (owner = ?))", [key, currentID, currentID], function(result) {
        if (result !== false) next(true);
        else {
            database.get("SELECT hash, salt FROM links WHERE key = ? AND fileName = ?", [key, fileName], function(result) {
                if (result !== false) {
                    let hash = result["hash"];
                    let salt = result["salt"];
                    if (hash === null && salt === null) {
                        if (next !== undefined) next(true);
                        return;
                    }

                    if (req.cookies.fileToken !== undefined) {
                        let fileToken = authorization.verifyToken(req.cookies.fileToken);
                        if (authorization.checkPayload(fileToken, {sub: "fileToken", path: [key, fileName].join("/")})) {
                            if (next !== undefined) next(true);
                        } else {
                            res.clearCookie("fileToken", {path: [key, fileName].join("/")});
                            res.status(403).send("Invalid token");
                        }
                        return;
                    } else if (req.headers.authorization !== undefined) {
                        if (req.headers.authorization.startsWith("Bearer ")) {
                            let fileToken = authorization.verifyToken(req.headers.authorization.substring(7));
                            if (authorization.checkPayload(fileToken, {sub: "fileToken", path: [key, fileName].join("/")})) {
                                if (next !== undefined) next(true);
                                return;
                            } else {
                                res.status(403).send("Invalid password");
                                return;
                            }
                        } else {
                            checkPassword(req, res, key, fileName, hash, salt, next);
                        }
                        return;
                    }
                }
                if (next !== undefined) next(false);
            });
        }
    });
}

function checkPassword(req, res, key, fileName, hash, salt, next) {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const strauth = new Buffer.from(b64auth, 'base64').toString();
    const splitIndex = strauth.indexOf(':');
    let password;
    if (splitIndex === -1) {
        password = strauth;
    } else {
        password = strauth.substring(splitIndex + 1);
    }

    if ((hash === null && salt === null) || hash === authorization.getHash(password, salt)) {
        let fileToken = authorization.createToken({sub: "fileToken", path: [key, fileName].join("/")});
        res.cookie("fileToken", fileToken, {
            path: "/" + ["shared", key, fileName].join("/"),
            secure: true,
            sameSite: "strict"
        });
        if (next !== undefined) next(fileToken);
    } else res.status(403).send("Invalid password");
}

function generateKey() {
    return crypto.randomBytes(8).toString("hex");
}

module.exports = {linkCheck: linkCheck,
                    createLink: createLink,
                    deleteLink: deleteLink,
                    getLinkKey: getLinkKey,
                    addLinkAccess: addLinkAccess,
                    updateLinkAccess: updateLinkAccess,
                    updateLinkPassword: updateLinkPassword,
                    deleteLinkPassword: deleteLinkPassword,
                    getLinkSummary: getLinkSummary,
                    getLinkInformation: getLinkInformation,
                    getSharingInformation: getSharingInformation,
                    getRealFilePath: getRealFilePath,
                    getRealFilePathLink: getRealFilePathLink,
                    doAuthorization: doAuthorization,
                    generateKey: generateKey};