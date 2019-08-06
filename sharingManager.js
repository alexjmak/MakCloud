const database = require("./databaseInit");
const authorization = require("./authorization");
const path = require("path");

const DEFAULT_FILES_LOCATION = "./files";

database.run("CREATE TABLE IF NOT EXISTS sharing (parent TEXT NOT NULL, file TEXT NOT NULL, owner INTEGER NOT NULL, shared INTEGER NOT NULL, expiration INTEGER DEFAULT NULL, hash TEXT DEFAULT NULL, salt TEXT DEFAULT NULL);");
database.run("CREATE TABLE IF NOT EXISTS links (file TEXT NOT NULL, owner INTEGER NOT NULL, link TEXT NOT NULL, expiration INTEGER);");

function linkExists(key, fileName, next) {
    if (fileName.indexOf("/") !== -1) {
        fileName = fileName.substring(0, fileName.indexOf("/"));
    }
    //fileName = (fileName.indexOf("/") === -1) ? fileName : fileName.substring(0, fileName.indexOf("/"));
    database.get("SELECT * FROM links WHERE key = ? AND file = ? AND (expiration > ? OR expiration IS NULL)", [key, fileName, Date.now()/1000], function(result) {
        if (result !== false) {
            if (next !== undefined) next(true);
        } else {
            if (next !== undefined) next(false);
            /*
            database.get("SELECT (parent || file) as newParent FROM links WHERE key = ? AND ('/' || ? || '/') LIKE (newParent || '/%');", [key, fileName], function(result) {
                if (result !== false) {
                    if (next !== undefined) next(true);
                } else {
                    if (next !== undefined) next(false);
                }
            });
            */

        }
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
    database.get("SELECT parent, owner FROM links WHERE key = ? AND file = ?", [key, searchFileName], function(result) {
        if (next !== undefined) {
            next(getRealFilePath(result.parent, fileName, result.owner));
        }
    });
}

function doAuthorization(key, fileName, req, res, next) {
    if (fileName.indexOf("/") !== -1) {
        fileName = fileName.substring(0, fileName.indexOf("/"));
    }

    database.get("SELECT hash, salt FROM links WHERE key = ? AND file = ?", [key, fileName], function(result) {
        if (result !== false) {
            let hash = result["hash"];
            let salt = result["salt"];
            if (hash === null && salt === null) {
                if (next !== undefined) next(true);
                return;
            }

            if (req.cookies.fileToken !== undefined) {
                let fileToken = authorization.verifyToken(req.cookies.fileToken);
                if (fileToken !== false && fileToken.subject === key + "/" + fileName) {
                    if (next !== undefined) next(true);
                } else {
                    if (next !== undefined) next(false)
                }
                return;
            } else if (req.headers.authorization !== undefined) {
                checkPassword(req, res, key, fileName, hash, salt, next);
                return;
            }
        }
        if (next !== undefined) next(false);
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
        res.cookie("fileToken", authorization.createToken(key + "/" + fileName), {
            path: "/shared/" + key + "/" + fileName,
            secure: true,
            sameSite: "strict"
        });
        if (next !== undefined) next(true);
        return;
    } else {
        res.status(401).send("Invalid password");
        return;
    }
}


module.exports = {linkExists: linkExists,
                    getLinkInformation: getLinkInformation,
                    getSharingInformation: getSharingInformation,
                    getRealFilePath: getRealFilePath,
                    getRealFilePathLink: getRealFilePathLink,
                    doAuthorization: doAuthorization};