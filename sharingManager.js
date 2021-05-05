const database = require("./core/databaseInit");
const accountManager = require("./accountManager");
const authorization = require("./authorization");
const path = require("path");
const crypto = require("crypto");
const preferences = require("./preferences");

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


async function addLinkAccess(filePath, owner, id, access, expiration, next) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    const key = await getLinkKey(filePath, owner);
    const exists = await linkAccessExists(key, id);

    if (!exists) {
        if (id === undefined) id = "public";

        await database.run(`INSERT INTO sharing (key, id, access, expiration)
                                  VALUES (?, ?, ?, ?)`, [key, id, access, expiration]);
    } else {
        throw new Error("Link access already exists");
    }

}

async function checkPassword(req, res, key, hash, salt) {
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
        const token = await authorization.createJwtToken({sub: "fileToken", path: key});
        res.cookie("fileToken", token, {
            path: path.join("/", "shared", key),
            secure: true,
            sameSite: "strict"
        });
        return token;
    } else {
        throw new Error("Invalid password");
    }
}

async function createLink(filePath, owner, options) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    const key = await generateKey();
    const exists = await linkExists(filePath, owner);
    if (!exists) {
        if (!options.password) {
            options.hash = null;
            options.salt = null;
        } else {
            options.salt = authorization.generateSalt();
            options.hash = authorization.getHash(options.password, options.salt);
        }
        await database.run(`INSERT INTO links (filePath, owner, key, hash, salt)
                                  VALUES (?, ?, ?, ?, ?)`, [filePath, owner, key, options.hash, options.salt]);

        try {
            await addLinkAccess(filePath, owner, "public", 0, null);
        } catch {
        }
        // Return the newly created link
        return "/" + ["shared", key].join("/") + "?view";
    } else {
        throw new Error("Link already exists");
    }


}

async function deleteLink(filePath, owner) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    await database.run(`DELETE FROM links
                              WHERE filePath = ? AND owner = ?;`, [filePath, owner]);
    await database.run(`DELETE FROM sharing
                              WHERE key NOT IN (SELECT key
                                                FROM links);`);
}

async function deleteLinkPassword(filePath, owner) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    await database.run(`UPDATE links
                        SET hash = ?, salt = ?
                        WHERE filePath = ? AND owner = ?`,
        [null, null, filePath, owner]);

}

async function doAuthorization(key, req, res, next) {
    let currentID = authorization.getID(req);
    if (currentID === undefined) currentID = "public";

    // Check for direct sharing access
    const result = await database.get(`SELECT sharing.key, id, owner
                                             FROM sharing
                                                 JOIN links ON sharing.key = links.key
                                             WHERE sharing.key = ? AND
                                                   ((id >= 0 AND id = ?) OR (owner = ?)) AND
                                                   access > 0 AND (expiration > ? OR expiration IS NULL)`,
                    [key, currentID, currentID, Date.now()/1000]);

    if (result) {
        if (req.method === "HEAD") res.sendStatus(200);
        else next();
    }
    else {
        const result = await database.get(`SELECT owner, hash, salt
                                           FROM links
                                           WHERE key = ?`, key);
        if (result) {
            // Check if user is logged in and is the owner of the file
            if (currentID !== "public" && result.owner === currentID) {
                if (req.method === "HEAD") res.sendStatus(200);
                else next();
                return;
            }

            let hash = result.hash;
            let salt = result.salt;

            // Check if file does not require a password
            if (hash === null && salt === null) {
                if (req.method === "HEAD") res.sendStatus(200);
                else next();
                return;
            }

            // Check for file JWT token to allow access
            if (req.cookies["fileToken"] !== undefined) {
                const fileToken = authorization.verifyToken(req.cookies["fileToken"], req);
                if (authorization.validPayload(fileToken, {sub: "fileToken", path: key})) {
                    if (req.method === "HEAD") res.sendStatus(200);
                    else next();
                } else {
                    res.clearCookie("fileToken", {path: key});
                    if (req.method === "HEAD") res.status(403).send("Invalid token");
                    else res.redirect(req.baseUrl + req.path + "?view");
                }
            // Check for authorization through password for file access
            } else if (req.headers.authorization !== undefined) {
                if (req.headers.authorization.startsWith("Bearer ")) {
                    let fileToken = authorization.verifyToken(req.headers.authorization.substring(7), req);
                    if (authorization.validPayload(fileToken, {sub: "fileToken", path: key})) {
                        if (req.method === "HEAD") res.sendStatus(200);
                        else next();
                    } else {
                        if (req.method === "HEAD") res.status(403).send("Invalid password");
                        else res.redirect(req.baseUrl + req.path + "?view");
                    }
                } else {
                    try {
                        await checkPassword(req, res, key, hash, salt);
                    } catch {
                        if (req.method === "HEAD") res.status(403).send("Invalid password");
                        else res.redirect(req.baseUrl + req.path + "?view");
                    }
                }
            }
        } else {

        }
    }
}

async function generateKey() {
    const key = crypto.randomBytes(8).toString("hex");
    const result = await database.get(`SELECT key
                                             FROM sharing
                                             WHERE key = ?
                                             UNION
                                             SELECT key
                                             FROM links
                                             WHERE key = ?`, [key, key]);

    if (result) return await generateKey();
    else return key;

}

async function getLinkInformation(select, whereKey, whereValue) {
    const result = await database.get("SELECT " + select + " FROM links WHERE " + whereKey + " = ?", whereValue);
    return result[select];
}

async function getLinkKey(filePath, owner) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    const result = await database.get(`SELECT key
                                             FROM links
                                             WHERE filePath = ? AND owner = ?;`, [filePath, owner]);
    if (result) {
        return result.key;
    }
}

async function getLinkSummary(filePath, owner) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";
    let linkSummary = {};
    const key = await getLinkKey(filePath, owner);
    if (key) {
        linkSummary["link"] = "/" + ["shared", key].join("/") + "?view";
        const hash = await getLinkInformation("hash", "key", key);
        linkSummary["passwordEnabled"] = (hash !== null && hash !== undefined);
        const sharing = await database.all(`SELECT username, id, access, expiration
                                                  FROM (SELECT username, sharing.id, access, expiration
                                                        FROM sharing JOIN accounts ON (sharing.id = accounts.id)
                                                        WHERE key = ?
                                                        UNION
                                                        SELECT username, sharing.id, access, expiration
                                                        FROM sharing
                                                        JOIN deleted_accounts ON (sharing.id = deleted_accounts.id)
                                                        WHERE key = ?
                                                        UNION
                                                        SELECT null, id, access, expiration
                                                        FROM sharing
                                                        WHERE key = ? AND id = 'public');`, [key, key, key]);
        for (let sharingUser of sharing) {
            if (sharingUser.id === "public") {
                sharingUser.username = "Public";
                break;
            }
        }
        linkSummary["sharing"] = sharing;
        return linkSummary;
    }
    return null;
}

function getRealFilePath(filePath, owner) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";
    return path.join(preferences.get("files"), owner.toString(), "files", filePath);
}

async function getRealFilePathLink(key) {
    const result = await database.get(`SELECT filePath, owner
                                             FROM links
                                             WHERE key = ?`, key);
    return getRealFilePath(result.filePath, result.owner);
}

async function getSharingInformation(select, whereKey, whereValue) {
    const result = await database.get("SELECT " + select + " FROM sharing WHERE " + whereKey + " = ?", whereValue);
    return result[select];
}

async function handle(filePath, req, res, next) {
    const owner = authorization.getID(req);
    const action = (req.body.action !== undefined) ? req.body.action : null;
    const expiration = (req.body.expiration !== undefined) ? req.body.expiration : null;
    const password = (req.body.password !== undefined) ? req.body.password : null;
    const access = (req.body.access !== undefined) ? req.body.access : null;
    let id = (req.body.id !== undefined) ? req.body.id : undefined;
    const username = (req.body.username !== undefined) ? req.body.username : undefined;

    switch (action) {
        case "create":
            try {
                const link = await createLink(filePath, owner, {expiration: expiration, password: password});
                res.status(201).send(link);
            } catch {
                res.sendStatus(409);
            }
            break;
        case "delete":
            try {
                await deleteLink(filePath, owner);
                res.sendStatus(200);
            } catch {
                res.sendStatus(500);
            }
            break;
        case "addAccess":
            if (!id && username) {
                id = await accountManager.getInformation("id", "username", username);
                if (!id) return res.sendStatus(404);
            }
            try {
                await addLinkAccess(filePath, owner, id, access, expiration);
                res.status(200).send(id.toString());
            } catch {
                res.sendStatus(400);
            }
            break;
        case "updateAccess":
            try {
                await updateLinkAccess(filePath, owner, id, access, expiration);
                res.send(id.toString());
            } catch {
                res.sendStatus(400);
            }
            break;
        case "removeAccess":
            try {
                await removeLinkAccess(filePath, owner, id);
                res.sendStatus(200);
            } catch {
                res.sendStatus(400);
            }
            break;
        case "setPassword":
            if (!password) break;
            try {
                await updateLinkPassword(filePath, owner, password);
                res.sendStatus(200);
            } catch {
                res.sendStatus(400);
            }
            break;
        case "deletePassword":
            try {
                await deleteLinkPassword(filePath, owner);
                res.sendStatus(200);
            } catch {
                res.sendStatus(400);
            }
            break;
        default:
            res.sendStatus(400);
            break;
    }
}

async function linkAccessExists(key, id) {
    if (id === undefined) id = "public";

    const result = await database.get(`SELECT *
                                             FROM sharing
                                             WHERE key = ? AND id = ?`, [key, id]);
    return !!result;
}

async function linkCheck(key, currentID) {
    const result = await database.get(`SELECT *
                                             FROM links
                                             WHERE key = ?`, key);
    if (result) {
        if (currentID && result.owner === currentID) {
            return 200;
        } else {
            const result = await database.get(`SELECT *
                                                     FROM sharing
                                                     WHERE key = ? AND
                                                           (id = ? or id = 'public') AND
                                                           access > 0 AND (expiration > ? OR expiration IS NULL)`,
                [key, currentID, Date.now()/1000]);
            if (result) {
                return 200;
            } else {
                return 403;
            }
        }
    } else {
        return 404;
    }
}

async function linkExists(filePath, owner) {
    filePath = decodeURIComponent(filePath);

    const result = await database.get(`SELECT *
                                             FROM links
                                             WHERE filePath = ? AND owner = ?`, [filePath, owner]);
    return !!result;
}

async function removeLinkAccess(filePath, owner, id) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    const key = await getLinkKey(filePath, owner);
    await database.run(`DELETE FROM sharing
                        WHERE key = ? AND id = ?`, [key, id]);
}

async function updateLinkAccess(filePath, owner, id, newAccess, newExpiration) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    const key = await getLinkKey(filePath, owner);

    if (newAccess) {
        await database.run(`UPDATE sharing
                            SET access = ?
                            WHERE key = ?
                            AND id = ?`, [newAccess, key, id]);
    }

    if (newExpiration) {
        await database.run(`UPDATE sharing
                            SET expiration = ?
                            WHERE key = ?
                            AND id = ?`, [newExpiration, key, id]);
    }

}

async function updateLinkPassword(filePath, owner, newPassword) {
    filePath = decodeURIComponent(filePath);
    if (filePath === "") filePath = "/";

    const salt = authorization.generateSalt();
    const hash = authorization.getHash(newPassword, salt);

    await database.run(`UPDATE links
                              SET hash = ?, salt = ?
                              WHERE filePath = ? AND owner = ?`, [hash, salt, filePath, owner]);
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