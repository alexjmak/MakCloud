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

function add(ip, list, milliseconds, next) {
    contains(ip, list, function(result) {
        let start = Date.now();
        let end = null;
        if (milliseconds || milliseconds === 0) end = start + milliseconds;
        let listName = Object.keys(LISTS).find(key => LISTS[key] === list).toLowerCase();
        if (!result) {
            database.run("INSERT INTO firewall (ip, list, start, end) VALUES (?, ?, ?, ?)", [ip, list, start, end], function(result) {
                if (result) {
                    log.write(`Added ${ip} to the ${listName}`);
                }
                if (next) next(result);
            });
        } else {
            database.get("SELECT * FROM firewall WHERE ip = ? AND list = ?", [ip, list], function(result) {
                let oldStart = result.start;
                let oldEnd = result.end;
                if (start === null || (oldStart !== null && oldStart < start)) start = oldStart;
                if (oldEnd === null || (end !== null && oldEnd > end)) end = oldEnd;
                if (start !== oldStart || end !== oldEnd) {
                    database.run("UPDATE firewall SET start = ?, end = ? WHERE ip = ? AND list = ?", [start, end, ip, list], function(result) {
                        if (result) {
                            log.write(`Updated ${ip} in the ${listName}`);
                        }
                        if (next) next(result);
                    });
                } else {
                    log.write(`No changes made to ${ip} in the ${listName}`);
                    if (next) next(result);
                }
            });
        }
    });

}

function check(ip, list, next) {
    let time = Date.now();
    database.get("SELECT * FROM firewall WHERE ip = ? AND list = ? AND (start <= ?)", [ip, list, time], function(result) {
        if (result) {
            if (result.end === null || result.end === undefined || result.end > time) {
                if (next) next(true, result.end);
            } else {
                remove(ip, list, function() {
                    if (next) next(false);
                });
            }
        } else {
            if (next) next(false);
        }
    });
}

function contains(ip, list, next) {
    database.get("SELECT * FROM firewall WHERE ip = ? and list = ?", [ip, list], function(result) {
        if (result) {
            if (next) next(result);
        } else {
            if (next) next(false);
        }
    });
}

function get(list, next) {
    if (typeof list === "function" && !next) {
        next = list;
        database.all("SELECT * FROM firewall ORDER BY ip", null, function(results) {
            if (next) next(results);
        })
    } else {
        database.all("SELECT * FROM firewall WHERE list = ? ORDER BY ip", list, function(results) {
            if (next) next(results);
        })
    }
}

function modifyEnd(ip, list, newEnd, next) {
    if (newEnd === undefined) {
        if (next) next(false);
        return;
    }
    contains(ip, list, function(result) {
        if (result) {
            database.run("UPDATE firewall SET end = ? WHERE ip = ? and list = ?", [newEnd, ip, list], function(result) {
                if (next) next(result);
            })
        }
    });
}

function modifyIp(ip, list, newIp, next) {
    if (newIp === undefined) {
        if (next) next(false);
        return;
    }
    contains(ip, list, function(result) {
        if (result) {
            database.run("UPDATE firewall SET ip = ? WHERE ip = ? and list = ?", [newIp, ip, list], function(result) {
                if (next) next(result);
            })
        }
    });
}

function modifyStart(ip, list, newStart, next) {
    if (newStart === undefined) {
        if (next) next(false);
        return;
    }
    contains(ip, list, function(result) {
        if (result) {
            database.run("UPDATE firewall SET start = ? WHERE ip = ? and list = ?", [newStart, ip, list], function(result) {
                if (next) next(result);
            })
        }
    });
}

function remove(ip, list, next) {
    contains(ip, list, function(result) {
        if (result) {
            database.run("DELETE FROM firewall WHERE (ip = ? AND list = ?) OR (end <= ?)", [ip, list, Date.now()], function(result) {
                let listName = Object.keys(LISTS).find(key => LISTS[key] === list).toLowerCase();
                log.write(`Removed ${ip} from the ${listName}`);
                if (next) next(result);
            });
        } else {
            if (next) next(false);
        }
    });
}

function getRedirectUrl(req) {
    let redirect = req.originalUrl.startsWith("/") ? req.originalUrl.substring(1) : req.originalUrl;
    if (redirect !== "") redirect = "?redirect=" + redirect;
    return redirect;
}

class blacklist {
    static add(ip, milliseconds, next) {
        add(ip, LISTS.BLACKLIST, milliseconds, next);
    }

    static check(ip, next) {
        check(ip, LISTS.BLACKLIST, next);
    }

    static contains(ip, next) {
        contains(ip, LISTS.BLACKLIST, next);
    }

    static enforce(req, res, next) {
        check(req.ip, LISTS.BLACKLIST, function(result, end) {
            if (result || !req.ip) {
                if (req.url !== "/login" && !req.url.startsWith("/login?redirect=")) {
                    return res.redirect("/logout" + getRedirectUrl(req));
                }
                res.render('login', {hostname: os.hostname(), firewall: "blacklisted", firewallEnd: end});
            } else {
                next();
            }
        });
    }

    static get(next) {
        get(LISTS.BLACKLIST, next);
    }

    static remove(ip, next) {
        remove(ip, LISTS.BLACKLIST, next);
    }
}

class whitelist {
    static add(ip, milliseconds, next) {
        add(ip, LISTS.WHITELIST, milliseconds, next);
    }

    static check(ip, next) {
        check(ip, LISTS.WHITELIST, next);
    }

    static contains(ip, next) {
        contains(ip, LISTS.WHITELIST, next);
    }

    static enforce(req, res, next) {
        check(req.ip, LISTS.WHITELIST, function(result) {
            if (!result || !req.ip) {
                if (req.url !== "/login" && !req.url.startsWith("/login?redirect=")) {
                    return res.redirect("/logout" + getRedirectUrl(req));
                }
                res.render('login', {hostname: os.hostname(), firewall: "not whitelisted"});
            } else {
                next();
            }
        });
    }

    static get(next) {
        get(LISTS.WHITELIST, next);
    }

    static remove(ip, next) {
        remove(ip, LISTS.WHITELIST, next);
    }
}

module.exports = {
    blacklist: blacklist,
    whitelist: whitelist,
    add: add,
    check: check,
    contains: contains,
    get: get,
    modifyEnd: modifyEnd,
    modifyIp: modifyIp,
    modifyStart: modifyStart,
    remove: remove
}