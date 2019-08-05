const database = require("./databaseInit");
const path = require("path");

const DEFAULT_FILES_LOCATION = "./files";

database.run("CREATE TABLE IF NOT EXISTS sharing (file TEXT NOT NULL, owner INTEGER NOT NULL, shared INTEGER NOT NULL, expiration INTEGER DEFAULT NULL);");
database.run("CREATE TABLE IF NOT EXISTS links (file TEXT NOT NULL, owner INTEGER NOT NULL, link TEXT NOT NULL, expiration INTEGER);");

function linkExists(key, fileName, next) {
    fileName = "%/" + fileName;
    database.all("SELECT * FROM links WHERE key = ? AND file LIKE ? AND (expiration > ? OR expiration IS NULL)", [key, fileName, Date.now()/1000], function(result) {
        if (result.length >= 1) {
            if (next !== undefined) next(true);
        } else {
            if (next !== undefined) next(false);
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


function getRealFilePath(filePath, owner) {
    return path.join(DEFAULT_FILES_LOCATION, owner.toString(), filePath);
}

module.exports = {linkExists: linkExists,
                    getLinkInformation: getLinkInformation,
                    getSharingInformation: getSharingInformation,
                    getRealFilePath: getRealFilePath};