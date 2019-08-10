const database = require("./databaseInit");
const authorization = require("./authorization");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_FILES_LOCATION = "./files";

database.run("CREATE TABLE IF NOT EXISTS sharing (key TEXT NOT NULL, shared INTEGER NOT NULL, UNIQUE(key, shared));", function () {
    database.run("CREATE TABLE IF NOT EXISTS links (parent TEXT NOT NULL, fileName TEXT NOT NULL, owner INTEGER NOT NULL, key TEXT NOT NULL UNIQUE, expiration INTEGER DEFAULT NULL, hash TEXT DEFAULT NULL, salt TEXT DEFAULT NULL, UNIQUE(parent, fileName, owner));", function() {
        database.run("DELETE FROM sharing WHERE key NOT IN (SELECT key FROM links);");
    });
});

function linkCheck(key, filePath, currentID, next) {
    if (currentID === undefined) currentID = -1;
    if (filePath.indexOf("/") !== -1) filePath = filePath.substring(0, filePath.indexOf("/"));

    database.get("SELECT * FROM links WHERE key = ? AND fileName = ? AND (expiration > ? OR expiration IS NULL)", [key, filePath, Date.now()/1000], function(result) {
        if (result !== false) {
            database.get("SELECT * FROM sharing WHERE key = ? AND (shared = ? OR shared = -1)", [key, currentID], function(result) {
                if (result !== false) {
                    if (next !== undefined) next(true);
                } else {
                    if (next !== undefined) next(401);
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

            if (options.password !== undefined) {
                options.salt = authorization.generateSalt();
                options.hash = authorization.getHash(options.password, options.salt);
            }
            if (options.password === undefined) {
                options.hash = null;
                options.salt = null;
            }
            if (options.expiration === undefined) options.expiration = null;


            database.run("INSERT INTO links (parent, fileName, owner, key, expiration, hash, salt) VALUES (?, ?, ?, ?, ?, ?, ?)", [parent, fileName, owner, key, options.expiration, options.hash, options.salt], function(result) {
                if (next !== undefined) {
                    if (next !== false) {
                        let link = path.join("/", "shared", key, fileName);
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

    database.get("SELECT * FROM sharing WHERE key = ? AND shared = ?", [key, id], function(result) {
        if (next !== undefined) {
            if (result !== false) next(true);
            else next(false);
        }
    })
}

function addLinkAccess(key, id, next) {
    linkAccessExists(key, id, function(exists) {
        if (!exists) {
            if (id === undefined) id = -1;
            else id = Number(id);

            database.run("INSERT INTO sharing (key, shared) VALUES (?, ?)", [key, id], function(result) {
                if (next !== undefined) next(result);
            });
        } else {
            if (next !== undefined) next(false);
        }
    });
}

function updateLinkExpiration(parent, fileName, owner, newExpiration, next) {
    database.run("UPDATE links SET expiration = ? WHERE parent = ? AND fileName = ? AND owner = ?", [newExpiration, parent, fileName, owner], function (result) {
        if (next !== undefined) next(result);
    });
}

function updateLinkPassword(parent, fileName, owner, newPassword, next) {
    let salt = authorization.generateSalt();
    let hash = authorization.getHash(newPassword, salt);

    database.run("UPDATE links SET hash = ?, salt = ? WHERE parent = ? AND fileName = ? AND owner = ?", [hash, salt, parent, fileName, owner], function (result) {
        if (next !== undefined) next(result);
    });
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

    database.get("SELECT sharing.key, shared, owner FROM sharing JOIN links ON sharing.key = links.key WHERE sharing.key = ? AND ((shared >= 0 AND shared = ?) OR (owner = ?))", [key, currentID, currentID], function(result) {
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
                        if (authorization.checkPayload(fileToken, {sub: "fileToken", path: key + "/" + fileName})) {
                            if (next !== undefined) next(true);
                        } else {
                            res.clearCookie("fileToken", {path: key + "/" + fileName});
                            res.status(401).send("Invalid token");
                        }
                        return;
                    } else if (req.headers.authorization !== undefined) {
                        if (req.headers.authorization.startsWith("Bearer ")) {
                            let fileToken = authorization.verifyToken(req.headers.authorization.substring(7));
                            if (authorization.checkPayload(fileToken, {sub: "fileToken", path: key + "/" + fileName})) {
                                if (next !== undefined) next(true);
                                return;
                            } else {
                                res.status(401).send("Invalid password");
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
        let fileToken = authorization.createToken({sub: "fileToken", path: key + "/" + fileName});
        res.cookie("fileToken", fileToken, {
            path: "/shared/" + key + "/" + fileName,
            secure: true,
            sameSite: "strict"
        });
        if (next !== undefined) next(fileToken);
        return;
    } else {
        res.status(401).send("Invalid password");
        return;
    }
}

function generateKey() {
    return crypto.randomBytes(8).toString("hex");
}

module.exports = {linkCheck: linkCheck,
                    createLink: createLink,
                    deleteLink: deleteLink,
                    getLinkKey: getLinkKey,
                    addLinkAccess: addLinkAccess,
                    updateLinkExpiration: updateLinkExpiration,
                    updateLinkPassword: updateLinkPassword,
                    getLinkInformation: getLinkInformation,
                    getSharingInformation: getSharingInformation,
                    getRealFilePath: getRealFilePath,
                    getRealFilePathLink: getRealFilePathLink,
                    doAuthorization: doAuthorization,
                    generateKey: generateKey};