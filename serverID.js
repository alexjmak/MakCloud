const crypto = require("crypto");
const fs = require("fs");

let serverID;

function getServerID() {
    return serverID;
}

function loadServerID() {
    try {
        serverID = fs.readFileSync("SERVER_ID").toString("utf8");
    } catch {
        fs.writeFileSync("SERVER_ID", crypto.randomBytes(16).toString("hex"));
        return loadServerID();
    }
}

loadServerID();

module.exports = getServerID();