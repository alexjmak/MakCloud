const fs = require("fs");
const log = require("./log");
const preferences = require("../preferences");

const keyFiles = preferences.get("keys");

let keys = {};

log.write("Loading keys...");

for (const group of Object.keys(keyFiles)) {
    if (!keys[group]) keys[group] = {};
    for (const key of Object.keys(keyFiles[group])) {
        const keyFilePath = keyFiles[group][key];
        keys[group][key] = fs.readFileSync(keyFilePath);
    }
}

module.exports = keys;