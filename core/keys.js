const log = require("./log");
const fs = require("fs");
const path = require("path");

const keyFolder = "keys";
const keyFiles = {
    https: {
        cert: "./https/cert.crt",
        key: "./https/key.key",
    },
    jwt: {
        secret: "./jwt/secret.key",
    }
}

let keys = {};

log.write("Loading keys...");
for (const group of Object.keys(keyFiles)) {
    if (!keys[group]) keys[group] = {};
    for (const key of Object.keys(keyFiles[group])) {
        let keyFilePath = path.join(keyFolder, keyFiles[group][key]);
        keys[group][key] = fs.readFileSync(keyFilePath);
    }
}



module.exports = keys;