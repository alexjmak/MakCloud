const database = require("./databaseInit");
const log = require("./log");
const os = require('os');
const render = require('../core/render');

const checkFirewallTable = ["CREATE TABLE IF NOT EXISTS firewall (ip TEXT NOT NULL);",
    "ALTER TABLE firewall ADD COLUMN ip TEXT NOT NULL DEFAULT -1;",
    "ALTER TABLE firewall ADD COLUMN list INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE firewall ADD COLUMN start INTEGER;",
    "ALTER TABLE firewall ADD COLUMN end INTEGER;"];


(async () => {
    try {
        await database.runList(checkFirewallTable, [], false);
    } catch {
    }
})();

const LISTS = {"BLACKLIST": 0, "WHITELIST": 1}

async function add(ip, list, milliseconds) {
    let start = Date.now();
    let end = null;
    if (milliseconds || milliseconds === 0) end = start + milliseconds;
    let listName = Object.keys(LISTS).find(key => LISTS[key] === list).toLowerCase();
    if (!(await contains(ip, list))) {
        await database.run("INSERT INTO firewall (ip, list, start, end) VALUES (?, ?, ?, ?)", [ip, list, start, end]);
        log.write(`Added ${ip} to the ${listName}`);
    } else {
        const result = await database.get("SELECT * FROM firewall WHERE ip = ? AND list = ?", [ip, list]);
        const oldStart = result.start;
        const oldEnd = result.end;
        if (start === null || (oldStart !== null && oldStart < start)) start = oldStart;
        if (oldEnd === null || (end !== null && oldEnd > end)) end = oldEnd;
        if (start !== oldStart || end !== oldEnd) {
            await database.run("UPDATE firewall SET start = ?, end = ? WHERE ip = ? AND list = ?", [start, end, ip, list]);
            log.write(`Updated ${ip} in the ${listName}`);
        } else {
            log.write(`No changes made to ${ip} in the ${listName}`);
        }
    }
}

async function check(ip, list) {
    const time = Date.now();
    const result = await database.get("SELECT * FROM firewall WHERE ip = ? AND list = ? AND (start <= ?)", [ip, list, time]);
    if (result) {
        if (result.end === null || result.end === undefined || result.end > time) {
            return result.end;
        } else {
            await remove(ip, list);
        }
    }
    return false;
}

async function contains(ip, list) {
    const result = await database.get("SELECT * FROM firewall WHERE ip = ? and list = ?", [ip, list]);
    if (result) {
        return result;
    }
    return false;

}

async function get(list) {
    if (list) {
        return await database.all("SELECT * FROM firewall WHERE list = ? ORDER BY ip", list);
    } else {
        return await database.all("SELECT * FROM firewall ORDER BY ip");
    }
}

async function modifyEnd(ip, list, newEnd) {
    if (newEnd === undefined) {
        return Promise.reject("New end date is undefined");
    }
    if (await contains(ip, list)) {
        await database.run("UPDATE firewall SET end = ? WHERE ip = ? and list = ?", [newEnd, ip, list]);
    } else {
        return Promise.reject("List entry not found");
    }
}

async function modifyIp(ip, list, newIp) {
    if (newIp === undefined) {
        return Promise.reject("New IP date is undefined");
    }
    if (await contains(ip, list)) {
        await database.run("UPDATE firewall SET ip = ? WHERE ip = ? and list = ?", [newIp, ip, list]);
    } else {
        return Promise.reject("List entry not found");
    }
}

async function modifyStart(ip, list, newStart) {
    if (newStart === undefined) {
        return Promise.reject("New start date is undefined");
    }
    if (await contains(ip, list)) {
        await database.run("UPDATE firewall SET start = ? WHERE ip = ? and list = ?", [newStart, ip, list]);
    } else {
        return Promise.reject("List entry not found");
    }
}

async function remove(ip, list) {
    if (await contains(ip, list)) {
        await database.run("DELETE FROM firewall WHERE (ip = ? AND list = ?) OR (end <= ?)", [ip, list, Date.now()]);
        let listName = Object.keys(LISTS).find(key => LISTS[key] === list).toLowerCase();
        log.write(`Removed ${ip} from the ${listName}`);
    } else {
        log.write(`${ip} already removed from the ${listName}`);
    }
}

function getRedirectUrl(req) {
    let redirect = req.originalUrl.startsWith("/") ? req.originalUrl.substring(1) : req.originalUrl;
    if (redirect !== "") redirect = "?redirect=" + redirect;
    return redirect;
}

class blacklist {
    static async add(ip, milliseconds) {
        return await add(ip, LISTS.BLACKLIST, milliseconds);
    }

    static async check(ip) {
        return await check(ip, LISTS.BLACKLIST);
    }

    static async contains(ip) {
        return await contains(ip, LISTS.BLACKLIST);
    }

    static async enforce(req, res, next) {
        const end = await check(req.ip, LISTS.BLACKLIST);
        if (end !== false || !req.ip) {
            if (req.url !== "/login" && !req.url.startsWith("/login?redirect=")) {
                res.redirect("/logout" + getRedirectUrl(req));
            } else {
                render('login', {firewall: 0, firewallEnd: end}, req, res, next);
            }
        } else {
            next();
        }

    }

    static async get() {
        return await get(LISTS.BLACKLIST);
    }

    static async remove(ip) {
        return await remove(ip, LISTS.BLACKLIST);
    }
}

class whitelist {
    static async add(ip, milliseconds) {
        return await add(ip, LISTS.WHITELIST, milliseconds);
    }

    static async check(ip) {
        return await check(ip, LISTS.WHITELIST);
    }

    static async contains(ip) {
        return await contains(ip, LISTS.WHITELIST);
    }

    static async enforce(req, res, next) {
        const exists = await check(req.ip, LISTS.WHITELIST);
        if (exists === false || !req.ip) {
            if (req.url !== "/login" && !req.url.startsWith("/login?redirect=")) {
                res.redirect("/logout" + getRedirectUrl(req));
            } else {
                render('login', {firewall: 1}, req, res, next);
            }
        } else {
            next();
        }
    }

    static async get() {
        return await get(LISTS.WHITELIST);
    }

    static async remove(ip) {
        return await remove(ip, LISTS.WHITELIST);
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