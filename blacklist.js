const fs = require('fs');
const path = require('path');
const log = require('./log');

const blacklistFile = path.join(__dirname, "blacklist.json");
let blacklist;

function reload() {
    fs.readFile(blacklistFile, function (err, data) {
        if (err) {
            fs.writeFileSync(blacklistFile, "{}");
            return reload();
        }
        data = data.toString();

        log.write("Reading blacklist...");
        try {
            blacklist = JSON.parse(data);
        } catch(err) {
            log.write("Read error: " + err);
        }
    });
}

function add(ip) {
    if (blacklist && !contains(ip)) {
        blacklist[ip] = [Date.now()];
        save();
        log.write(`Added ${ip} to the blacklist`)
    }
}

function remove(ip) {
    if (blacklist && contains(ip)) {
        delete blacklist[ip]
        save();
        log.write(`Removed ${ip} to the blacklist`)
    }
}

function get() {
    return blacklist.slice();
}


function contains(ip) {
    if (blacklist) {
        return blacklist.hasOwnProperty(ip);
    }
}

function save() {
    fs.writeFile(blacklistFile, JSON.stringify(blacklist), function(err) {
        if (err) {
            log.write("Save error");
        }
    })
}


reload();

module.exports = {add: add, remove: remove, get: get, contains: contains, reload: reload};