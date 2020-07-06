const fs = require('fs');
const jwt = require("jsonwebtoken");
const database = require("./databaseInit");
const crypto = require("crypto");
const firewall = require("./firewall");
const path = require("path");

const accountManager = require("./accountManager")
const serverID = require("./serverID");
const log = require("./log");

const secretKeyFilePath = path.join(__dirname, "..", "keys", "jwt", "secret.key");
const secretKey = fs.readFileSync(secretKeyFilePath, 'utf8');

const LOGIN = {"SUCCESS": 0, "FAIL": 1, "DISABLED": 2};

let bruteForceProtection = {};

function checkCredentials(username, password, next) {
    database.get("SELECT id FROM accounts WHERE lower(username) = ?", username.toLowerCase(), function(result) {
        if (result === undefined) {
            if (next !== undefined) next(LOGIN.FAIL, result);
        } else {
            let id = result.id;
            checkPassword(id, password, function(result) {
                if (next !== undefined) next(result, id);
            });
        }
    });
}

function checkPassword(id, password, next) {
    database.get("SELECT * FROM accounts WHERE id = ?", id, function(result) {
        if (result !== false) {
            let hash = result["hash"];
            let salt = result["salt"];
            let enabled = result["enabled"] === 1;
            if (hash === getHash(password, salt)) {
                if (enabled && next !== undefined) next(LOGIN.SUCCESS, id);
                else if (next !== undefined) next(LOGIN.DISABLED);
            } else if (next !== undefined) next(LOGIN.FAIL);
        } else {
            if (next !== undefined) next(LOGIN.FAIL);
        }
    });
}

function checkPayload(token, payload) {
    if (token === false) return false;
    for (let key in payload)  {
        if (!payload.hasOwnProperty(key)) continue;
        if (!token.hasOwnProperty(key)) return false;
        if (payload[key] !== token[key]) return false;
    }
    return token.iss === serverID;
}

function createToken(payload, expiration) {
    if (payload.hasOwnProperty("iss")) delete payload.iss;
    if (expiration === undefined) expiration = "7d";
    payload = Object.assign({}, payload, {iss: serverID});
    return jwt.sign(payload, secretKey, {expiresIn: expiration});
}

function doAuthorization(req, res, next) {
    let redirect = getRedirectUrl(req);

    function checkAccount() {
        accountManager.idExists(getID(req), true, function(exists) {
            if (exists) {
                if (next) next(true);
            } else {
                res.redirect("/logout" + redirect);
                if (next) next(false);
            }
        });
    }
    if (req.headers.authorization !== undefined) {
        if (req.headers.authorization.startsWith("Bearer ")) {
            let loginToken = verifyToken(req.headers.authorization.substring("Bearer ".length), req);
            if (loginToken !== false && checkPayload(loginToken, {sub: "loginToken"})) {
                checkAccount();
                return;
            }
        }
        res.redirect("/logout" + redirect);
        if (next) next(false);
    } else if (req.cookies.loginToken !== undefined) {
        let loginToken = verifyToken(req.cookies.loginToken, req);
        if (loginToken !== false && checkPayload(loginToken, {sub: "loginToken"})) {
            checkAccount();
            return;
        }
        res.redirect("/logout" + redirect);
        if (next) next(false);
    } else {
        res.redirect("/login" + redirect);
        if (next) next(false);
    }
}

function generateSalt() {
    return crypto.randomBytes(16).toString("hex");
}

function getHash(password, salt) {
    return crypto.createHmac('sha512', salt).update(password).digest('hex');
}

function getID(req) {
    let cookieName = "loginToken";
    if (req.cookies[cookieName] === undefined) return null;
    return verifyToken(req.cookies[cookieName], req).aud;
}

function getRedirectUrl(req) {
    let redirect = req.originalUrl.startsWith("/") ? req.originalUrl.substring(1) : req.originalUrl;
    if (redirect !== "") redirect = "?redirect=" + redirect;
    return redirect;
}

function login(req, res, next) {
    if (req.headers.authorization !== undefined) {
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const strauth = new Buffer.from(b64auth, 'base64').toString();
        const splitIndex = strauth.indexOf(':');
        const username = strauth.substring(0, splitIndex);
        const password = strauth.substring(splitIndex + 1);

        checkCredentials(username, password, function(result, id) {
            switch(result) {
                case LOGIN.SUCCESS:
                    if (bruteForceProtection.hasOwnProperty(req.ip)) delete bruteForceProtection[req.ip];
                    res.cookie("loginToken", createToken({sub: "loginToken", aud: id}), {path: "/", secure: true, sameSite: "strict"});
                    if (next) next([id, username, password]);
                    else res.status(200).send();
                    break;
                case LOGIN.FAIL:
                    if (!bruteForceProtection.hasOwnProperty(req.ip)) bruteForceProtection[req.ip] = 0;
                    bruteForceProtection[req.ip]++;
                    if (bruteForceProtection[req.ip] % 5 === 0) {
                        res.status(429).send(`Too many attempts. Try again in ${bruteForceProtection[req.ip]} minutes.`);
                        return firewall.blacklist.add(req.ip, bruteForceProtection[req.ip] * 60 * 1000);
                    }
                    res.status(403).send("Invalid username and/or password");
                    if (next) next(false);
                    break;
                case LOGIN.DISABLED:
                    if (bruteForceProtection.hasOwnProperty(req.ip)) delete bruteForceProtection[req.ip];
                    res.status(403).send("Your account is disabled");
                    if (next) next(false);
                    break;
            }
        });
    } else {
        res.redirect("/login");
        if (next) next(false);
    }
}

function verifyToken(rawToken, req){
    if (rawToken === undefined) return false;
    try {
        return jwt.verify(rawToken, secretKey);
    } catch (err) {
        if (req) {
            firewall.blacklist.add(req.ip, 10 * 60 * 1000)
            log.writeServer(req, err);
        }
        else log.write(err);
    }
    return false;
}

module.exports = {
    LOGIN: LOGIN,
    checkCredentials: checkCredentials,
    checkPassword: checkPassword,
    checkPayload: checkPayload,
    createToken: createToken,
    doAuthorization: doAuthorization,
    generateSalt: generateSalt,
    getHash: getHash,
    getID: getID,
    getRedirectUrl: getRedirectUrl,
    login: login,
    verifyToken: verifyToken
};