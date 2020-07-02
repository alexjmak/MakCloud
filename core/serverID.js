const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const serverIDFile = path.join(__dirname, "..", "SERVER_ID");

let serverID;

function getServerID() {
    return serverID;
}

function loadServerID() {
    try {
        serverID = fs.readFileSync(serverIDFile).toString("utf8");
    } catch {
        fs.writeFileSync(serverIDFile, crypto.randomBytes(16).toString("hex"));
        return loadServerID();
    }
}

loadServerID();

module.exports = getServerID();