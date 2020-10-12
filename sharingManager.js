const database = require("./core/databaseInit");
const accountManager = require("./accountManager");
const authorization = require("./authorization");
const path = require("path");
const crypto = require("crypto");
const preferences = require("./preferences");

database.run("CREATE TABLE IF NOT EXISTS sharing (key TEXT NOT NULL, id INTEGER NOT NULL, access INTEGER NOT NULL DEFAULT 0, expiration INTEGER DEFAULT NULL, UNIQUE(key, id));", [], function () {
    database.run("CREATE TABLE IF NOT EXISTS links (path TEXT NOT NULL, owner INTEGER NOT NULL, key TEXT NOT NULL UNIQUE, hash TEXT DEFAULT NULL, salt TEXT DEFAULT NULL, UNIQUE(path, owner));", [], function() {
        database.run("DELETE FROM sharing WHERE key NOT IN (SELECT key FROM links);");
    });
});

const checkSharingTable = [
    "CREATE TABLE IF NOT EXISTS sharing (key TEXT PRIMARY KEY NOT NULL DEFAULT '');",
    "ALTER TABLE sharing ADD COLUMN key TEXT PRIMARY KEY NOT NULL DEFAULT '';",
    "ALTER TABLE sharing ADD COLUMN id TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE sharing ADD COLUMN access INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE sharing ADD COLUMN expiration INTEGER;"
];

const checkLinksTable = [
    "CREATE TABLE IF NOT EXISTS links (key TEXT PRIMARY KEY NOT NULL DEFAULT '');",
    "ALTER TABLE links ADD COLUMN key TEXT PRIMARY KEY NOT NULL DEFAULT '';",
    "ALTER TABLE links ADD COLUMN filePath TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE links ADD COLUMN owner TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE links ADD COLUMN hash TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE links ADD COLUMN salt TEXT NOT NULL DEFAULT '';"
];

(async () => {
    try {
        await database.runList(checkSharingTable, [], false);
    } catch {}
    try {
        await database.runList(checkLinksTable, [], false);
    } catch {}
})();


function addLinkAccess(filePath, owner, id, access, expiration, next) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    getLinkKey(filePath, owner, function(key) {
        linkAccessExists(key, id, function (exists) {
            if (!exists) {
                if (id === undefined) id = "public";

                database.run("INSERT INTO sharing (key, id, access, expiration) VALUES (?, ?, ?, ?)", [key, id, access, expiration], function (result) {
                    if (next !== undefined) next(result);
                });
            } else {
                if (next !== undefined) next(!exists);
            }
        });
    });
}

function checkPassword(req, res, key, hash, salt, next) {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const strauth = new Buffer.from(b64auth, 'base64').toString();
    const splitIndex = strauth.indexOf(':');
    let password;
    if (splitIndex === -1) {
        password = strauth;
    } else {
        password = strauth.substring(splitIndex + 1);
    }
    password = decodeURIComponent(password);

    if ((hash === null && salt === null) || hash === authorization.getHash(password, salt)) {
        authorization.createJwtToken({sub: "fileToken", path: key}, function(err, token) {
            if (err) {
                if (next) next(null);
                return;
            }
            res.cookie("fileToken", token, {
                path: path.join("/", "shared", key),
                secure: true,
                sameSite: "strict"
            });
            if (next) next(token);
        });
    } else res.status(403).send("Invalid password");
}

function createLink(filePath, owner, options, next) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    generateKey(function(key) {
        linkExists(filePath, owner, function(exists) {
            if (!exists) {
                if (options.password === undefined || options.password === null) {
                    options.hash = null;
                    options.salt = null;
                } else {
                    options.salt = authorization.generateSalt();
                    options.hash = authorization.getHash(options.password, options.salt);
                }

                database.run("INSERT INTO links (filePath, owner, key, hash, salt) VALUES (?, ?, ?, ?, ?)", [filePath, owner, key, options.hash, options.salt], function(result) {
                    if (next !== undefined) {
                        if (next !== false) {
                            addLinkAccess(filePath, owner, "public", 0, null);
                            let link = "/" + ["shared", key].join("/") + "?view";
                            next(link);
                        } else {
                            next(false);
                        }
                    }
                });
            } else if (next !== undefined) next(false);
        });
    });
}

function deleteLink(filePath, owner, next) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    database.run("DELETE FROM links WHERE filePath = ? AND owner = ?", [filePath, owner], function (result) {
        database.run("DELETE FROM sharing WHERE key NOT IN (SELECT key FROM links);");
        if (next !== undefined) next(result);
    });
}

function deleteLinkPassword(filePath, owner, next) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    database.run("UPDATE links SET hash = ?, salt = ? WHERE filePath = ? AND owner = ?", [null, null, filePath, owner], function (result) {
        if (next !== undefined) next(result);
    });
}

function doAuthorization(key, req, res, next) {
    let currentID = authorization.getID(req);
    if (currentID === undefined) currentID = "public";

    database.get("SELECT sharing.key, id, owner FROM sharing JOIN links ON sharing.key = links.key WHERE sharing.key = ? AND ((id >= 0 AND id = ?) OR (owner = ?)) AND access > 0 AND (expiration > ? OR expiration IS NULL)", [key, currentID, currentID, Date.now()/1000], function(result) {

        if (result !== false) next(true);
        else {
            database.get("SELECT owner, hash, salt FROM links WHERE key = ?", key, function(result) {
                if (result !== false) {
                    if (currentID >= 0 && result.owner === currentID) {
                        if (next) return next(true);
                    }
                    let hash = result.hash;
                    let salt = result.salt;
                    if (hash === null && salt === null) {
                        if (next !== undefined) next(true);
                        return;
                    }

                    if (req.cookies.fileToken !== undefined) {
                        let fileToken = authorization.verifyToken(req.cookies.fileToken, req);
                        if (authorization.checkPayload(fileToken, {sub: "fileToken", path: key})) {
                            if (next !== undefined) next(true);
                        } else {
                            res.clearCookie("fileToken", {path: key});
                            res.status(403).send("Invalid token");
                        }
                        return;
                    } else if (req.headers.authorization !== undefined) {
                        if (req.headers.authorization.startsWith("Bearer ")) {
                            let fileToken = authorization.verifyToken(req.headers.authorization.substring(7), req);
                            if (authorization.checkPayload(fileToken, {sub: "fileToken", path: key})) {
                                if (next !== undefined) next(true);
                                return;
                            } else {
                                res.status(403).send("Invalid password");
                                return;
                            }
                        } else {
                            checkPassword(req, res, key, hash, salt, next);
                        }
                        return;
                    }
                }
                if (next !== undefined) next(false);
            });
        }
    });
}

function generateKey(next) {
    let key = crypto.randomBytes(8).toString("hex");
    database.get("SELECT key FROM sharing WHERE key = ? UNION SELECT key FROM links WHERE key = ?", [key, key], function(result) {
        if (next !== undefined) {
            if (result !== false) next(generateKey());
            else next(key);
        }
    });
}

function getLinkInformation(select, whereKey, whereValue, next) {
    database.get("SELECT " + select + " FROM links WHERE " + whereKey + " = ?", whereValue, function(result) {
        if (next !== undefined) next(result[select]);
    });
}

function getLinkKey(filePath, owner, next) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    database.get("SELECT key FROM links WHERE filePath = ? AND owner = ?;", [filePath, owner], function(result) {
        if (result !== false) {
            if (next !== undefined) next(result.key);
        } else {
            if (next !== undefined) next(false);
        }

    });
}

function getLinkSummary(filePath, owner, next) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";
    let linkSummary = {};
    getLinkKey(filePath, owner, function(key)  {
        if (key !== false){
            linkSummary["link"] = "/" + ["shared", key].join("/") + "?view";
            getLinkInformation("hash", "key", key, function(hash) {
                linkSummary["passwordEnabled"] = (hash !== null && hash !== undefined);
                database.all("SELECT username, id, access, expiration FROM (SELECT username, sharing.id, access, expiration FROM sharing JOIN accounts ON (sharing.id = accounts.id) WHERE key = ? UNION SELECT username, sharing.id, access, expiration FROM sharing JOIN deleted_accounts ON (sharing.id = deleted_accounts.id) WHERE key = ? UNION SELECT null, id, access, expiration FROM sharing WHERE key = ? AND id = 'public');", [key, key, key], function(sharing) {
                    for (let sharingUser in sharing) {
                        sharingUser = sharing[sharingUser];
                        if (sharingUser.id === "public") {
                            sharingUser.username = "Public";
                            break;
                        }
                    }
                    linkSummary["sharing"] = sharing;
                    if(next !== undefined) next(linkSummary);
                });
            });
        } else {
            if(next !== undefined) next(null);
        }

    })
}

function getRealFilePath(filePath, owner) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";
    return path.join(preferences.get("files"), owner.toString(), "files", filePath);
}

function getRealFilePathLink(key, next) {
    database.get("SELECT filePath, owner FROM links WHERE key = ?", key, function(result) {
        if (next !== undefined) {
            next(getRealFilePath(result.filePath, result.owner));
        }
    });
}

function getSharingInformation(select, whereKey, whereValue, next) {
    database.get("SELECT " + select + " FROM sharing WHERE " + whereKey + " = ?", whereValue, function(result) {
        if (next !== undefined) next(result[select]);
    });
}

function handle(filePath, req, res, next) {
    let owner = authorization.getID(req);
    let action = (req.body.action !== undefined) ? req.body.action : null;
    let expiration = (req.body.expiration !== undefined) ? req.body.expiration : null;
    let password = (req.body.password !== undefined) ? req.body.password : null;
    let access = (req.body.access !== undefined) ? req.body.access : null;
    let id = (req.body.id !== undefined) ? req.body.id : undefined;
    let username = (req.body.username !== undefined) ? req.body.username : undefined;

    switch (action) {
        case "create":
            createLink(filePath, owner, {expiration: expiration, password: password}, function(link) {
                if (link !== false) res.status(201).send(link);
                else res.sendStatus(409);
            });
            break;
        case "delete":
            deleteLink(filePath, owner, function(result) {
                res.sendStatus(200)
            });
            break;
        case "addAccess":
            let callback = function(id) {
                addLinkAccess(filePath, owner, id, access, expiration, function(result) {
                    if (result) res.status(200).send(id);
                    else res.sendStatus(400);
                });
            };
            if (id === undefined && username !== undefined) {
                accountManager.getInformation("id", "username", username, function(id) {
                    if (id === undefined) res.sendStatus(404);
                    else callback(id);
                });
            } else callback(id);
            break;
        case "updateAccess":
            updateLinkAccess(filePath, owner, id, access, expiration, function(result) {
                if (result) res.send(id.toString());
                else res.sendStatus(400);
            });
            break;
        case "removeAccess":
            removeLinkAccess(filePath, owner, id, function(result) {
                if (result) res.sendStatus(200);
                else res.sendStatus(400);
            });
            break;
        case "setPassword":
            if (!password) break;
            updateLinkPassword(filePath, owner, password, function(result) {
                if (result) res.sendStatus(200);
                else res.sendStatus(400);
            });
            break;
        case "deletePassword":
            deleteLinkPassword(filePath, owner, function(result) {
                if (result) res.sendStatus(200);
                else res.sendStatus(400);
            });
            break;
        default:
            res.sendStatus(404);
            break;
    }
}
function linkAccessExists(key, id, next) {
    if (id === undefined) id = "public";

    database.get("SELECT * FROM sharing WHERE key = ? AND id = ?", [key, id], function(result) {
        if (next !== undefined) {
            if (result !== false) next(true);
            else next(false);
        }
    })
}

function linkCheck(key, currentID, next) {

    database.get("SELECT * FROM links WHERE key = ?", key, function(result) {
        if (result !== false) {
            if (currentID && result.owner === currentID) {
                if (next !== undefined) next(true);
            } else {

                database.get("SELECT * FROM sharing WHERE key = ? AND (id = ? or id = 'public') AND access > 0 AND (expiration > ? OR expiration IS NULL)", [key, currentID, Date.now()/1000], function(result) {
                    if (result !== false) {
                        if (next !== undefined) next(true);
                    } else {
                        if(!currentID) next(false);
                        else if (next !== undefined) next(403);
                    }
                });
            }
        } else {
            if (next !== undefined) next(404);
        }
    });
}

function linkExists(filePath, owner, next) {
    filePath = decodeURIComponent(filePath);

    database.get("SELECT * FROM links WHERE filePath = ? AND owner = ?", [filePath, owner], function(result) {
        if (result !== false) {
            if (next !== undefined) next(true);
        } else {
            if (next !== undefined) next(false);
        }
    });
}

function removeLinkAccess(filePath, owner, id, next) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    getLinkKey(filePath, owner, function(key) {
        database.run("DELETE FROM sharing WHERE key = ? AND id = ?", [key, id], function (accessResult) {
            if (next !== undefined) next(accessResult);
        });
    });
}

function updateLinkAccess(filePath, owner, id, newAccess, newExpiration, next) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    getLinkKey(filePath, owner, function(key) {
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
    });
}

function updateLinkPassword(filePath, owner, newPassword, next) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    let salt = authorization.generateSalt();
    let hash = authorization.getHash(newPassword, salt);

    database.run("UPDATE links SET hash = ?, salt = ? WHERE filePath = ? AND owner = ?", [hash, salt, filePath, owner], function (result) {
        if (next !== undefined) next(result);
    });
}

module.exports = {
    addLinkAccess: addLinkAccess,
    createLink: createLink,
    deleteLink: deleteLink,
    deleteLinkPassword: deleteLinkPassword,
    doAuthorization: doAuthorization,
    getLinkInformation: getLinkInformation,
    getLinkSummary: getLinkSummary,
    getRealFilePathLink: getRealFilePathLink,
    handle: handle,
    linkCheck: linkCheck,
    removeLinkAccess: removeLinkAccess,
    updateLinkAccess: updateLinkAccess,
    updateLinkPassword: updateLinkPassword
};