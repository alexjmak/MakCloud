const database = require("./databaseInit");
const log = require("./log");
const os = require('os');

const checkFirewallTable = ["CREATE TABLE IF NOT EXISTS firewall (ip TEXT NOT NULL);",
    "ALTER TABLE firewall ADD COLUMN ip TEXT NOT NULL DEFAULT -1;",
    "ALTER TABLE firewall ADD COLUMN list INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE firewall ADD COLUMN start INTEGER;",
    "ALTER TABLE firewall ADD COLUMN end INTEGER;"];

database.runList(checkFirewallTable, [], function() {}, false);

const LISTS = {"BLACKLIST": 0, "WHITELIST": 1}

function _add(ip, list, hours, next) {
    let start = Date.now();
    let end = null;
    if (hours || hours === 0) end = start + (hours * 60 * 60 * 1000);
    database.run("INSERT INTO firewall (ip, list, start, end) VALUES (?, ?, ?, ?)", [ip, list, start, end], function(result) {
        if (result) {
            let listName = Object.keys(LISTS).find(key => LISTS[key] === list).toLowerCase();
            log.write(`Added ${ip} to the ${listName}`);
        }
        if (next) next(result);
    });
}

function _check(ip, list, next) {
    let time = Date.now();
    database.get("SELECT * FROM firewall WHERE ip = ? and list = ? and (start <= ? or start is NULL)", [ip, list, time], function(result) {
        if (result) {
            if (!result.end || result.end > time) {
                if (next) next(true, result.end);
            } else {
                _remove(ip, list, function() {
                    if (next) next(false);
                });
            }
        } else {
            if (next) next(false);
        }
    });
}

function _contains(ip, list, next) {
    database.get("SELECT * FROM firewall WHERE ip = ? and list = ?", [ip, list], function(result) {
        if (result) {
            if (next) next(result);
        } else {
            if (next) next(false);
        }
    });
}

function _get(list, next) {
    if (typeof list === "function" && !next) {
        next = list;
        database.all("SELECT * FROM firewall", null, function(results) {
            if (next) next(results);
        })
    } else {
        database.all("SELECT * FROM firewall WHERE list = ?", list, function(results) {
            if (next) next(results);
        })
    }
}

function _remove(ip, list, next) {
    _contains(ip, list, function(result) {
        if (result) {
            database.run("DELETE FROM firewall WHERE ip = ? and list = ?", [ip, list], function(result) {
                let listName = Object.keys(LISTS).find(key => LISTS[key] === list).toLowerCase();
                log.write(`Removed ${ip} from the ${listName}`);
                if (next) next(result);
            });
        } else {
            if (next) next(false);
        }
    });
}

function get(next) {
    _get(next);
}

class blacklist {
    static add(ip, hours, next) {
        _add(ip, LISTS.BLACKLIST, hours, next);
    }

    static check(ip, next) {
        _check(ip, LISTS.BLACKLIST, next);
    }

    static contains(ip, next) {
        _contains(ip, LISTS.BLACKLIST, next);
    }

    static enforce(req, res, next) {
        _check(req.ip, LISTS.BLACKLIST, function(result, end) {
            if (result || !req.ip) {
                if (req.url !== "/login") return res.redirect("/logout");
                res.render('login', {hostname: os.hostname(), firewall: "blacklisted", firewallEnd: end});
            } else {
                next();
            }
        });
    }

    static get(next) {
        _get(LISTS.BLACKLIST, next);
    }

    static remove(ip, next) {
        _remove(ip, LISTS.BLACKLIST, next);
    }
}

class whitelist {
    static add(ip, hours, next) {
        _add(ip, LISTS.WHITELIST, hours, next);
    }

    static check(ip, next) {
        _check(ip, LISTS.WHITELIST, next);
    }

    static contains(ip, next) {
        _contains(ip, LISTS.WHITELIST, next);
    }

    static enforce(req, res, next) {
        _check(req.ip, LISTS.WHITELIST, function(result) {
            if (!result || !req.ip) {
                if (req.url !== "/login") return res.redirect("/logout");
                res.render('login', {hostname: os.hostname(), firewall: "not whitelisted"});
            } else {
                next();
            }
        });
    }

    static get(next) {
        _get(LISTS.WHITELIST, next);
    }

    static remove(ip, next) {
        _remove(ip, LISTS.WHITELIST, next);
    }
}

module.exports = {
    blacklist: blacklist,
    whitelist: whitelist,
    get: get
}