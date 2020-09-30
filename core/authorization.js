const fs = require('fs');
const jwt = require("jsonwebtoken");
const database = require("./databaseInit");
const crypto = require("crypto");
const firewall = require("./firewall");
const path = require("path");

const accountManager = require("./accountManager");
const localeManager = require("./localeManager");
const serverID = require("./serverID");
const keys = require("./keys");
const log = require("./log");

const secretKey = keys.jwt.secret;

const LOGIN = {"SUCCESS": 0, "FAIL": 1, "DISABLED": 2};

let bruteForceProtection = {};

async function checkCredentials(username, password) {
    const result = await database.get("SELECT id FROM accounts WHERE lower(username) = ?", username.toLowerCase());
    if (!result) {
        return {loginResult: LOGIN.FAIL, id: null};
    } else {
        const id = result.id;
        const loginResult = await checkPassword(id, password);
        return {loginResult: loginResult, id: id};
    }
}

async function checkPassword(id, password) {
    const result = await database.get("SELECT * FROM accounts WHERE id = ?", id);
    if (result) {
        let hash = result["hash"];
        let salt = result["salt"];
        let enabled = result["enabled"] === 1;
        if (hash === getHash(password, salt)) {
            if (enabled) return LOGIN.SUCCESS;
            else return LOGIN.DISABLED;
        } else return LOGIN.FAIL;
    } else {
        return LOGIN.FAIL;
    }
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

function createJwtToken(payload, maxAge) {
    return new Promise((resolve, reject) => {
        if (!maxAge) maxAge = 3 * 24 * 60 * 60 * 1000;
        if (payload.hasOwnProperty("iss")) delete payload.iss;
        payload = Object.assign({}, payload, {iss: serverID});
        jwt.sign(payload, secretKey, {expiresIn: maxAge + "ms"}, function (err, token) {
            if (!err) {
                resolve(token);
            } else {
                reject(err);
            }
        });
    });
}

async function createLoginTokenCookie(res, id, next, maxAge) {
    if (!maxAge) maxAge = 3 * 24 * 60 * 60 * 1000;
    const token = await createJwtToken({sub: "loginToken", aud: id}, maxAge);
    res.cookie("loginToken", token, {maxAge: maxAge, path: "/", secure: true, sameSite: "strict"});
    return token;
}

async function doAuthorization(req, res, next) {
    let redirect = getRedirectUrl(req);

    async function callback(loginToken, next) {
        const exists = await accountManager.idExists(getID(req), true);
        if (exists) {
            await renewLoginToken(loginToken, req, res);
            next();
        } else {
            res.redirect("/logout" + redirect);
        }
    }

    if (req.headers.authorization !== undefined) {
        if (req.headers.authorization.startsWith("Bearer ")) {
            let loginToken = verifyToken(req.headers.authorization.substring("Bearer ".length), req);
            if (loginToken !== false && checkPayload(loginToken, {sub: "loginToken"})) {
                await callback(loginToken, next);
                return;
            }
        }
        res.redirect("/logout" + redirect);
    } else if (req.cookies.loginToken !== undefined) {
        let loginToken = verifyToken(req.cookies.loginToken, req);
        if (loginToken !== false && checkPayload(loginToken, {sub: "loginToken"})) {
            await callback(loginToken, next);
            return;
        }
        res.redirect("/logout" + redirect);
    } else {
        res.redirect("/login" + redirect);
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

async function login(req, res, next, onSuccess) {
    if (req.headers.authorization !== undefined) {
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const strauth = new Buffer.from(b64auth, 'base64').toString();
        const splitIndex = strauth.indexOf(':');
        const username = decodeURIComponent(strauth.substring(0, splitIndex));
        const password = decodeURIComponent(strauth.substring(splitIndex + 1));

        const results = await checkCredentials(username, password);
        const loginResult = results.loginResult;
        const id = results.id;
        const locale = localeManager.get(req);
        switch (loginResult) {
            case LOGIN.SUCCESS:
                if (bruteForceProtection.hasOwnProperty(req.ip)) delete bruteForceProtection[req.ip];
                let token = null;
                try {
                    token = await createLoginTokenCookie(res, id);
                } catch {
                    log.writeServer(req, "Token creation error")
                    res.status(500);
                    return;
                }
                if (onSuccess) {
                    await onSuccess(id, username, password, req);
                }
                res.status(200).send(token);
                break;
            case LOGIN.FAIL:
                if (!bruteForceProtection.hasOwnProperty(req.ip)) bruteForceProtection[req.ip] = 0;
                bruteForceProtection[req.ip]++;
                if (bruteForceProtection[req.ip] % 5 === 0) {
                    res.status(429).send(`Too many attempts. Try again in ${bruteForceProtection[req.ip]} minutes.`);
                    await firewall.blacklist.add(req.ip, bruteForceProtection[req.ip] * 60 * 1000);
                    return;
                }
                res.status(403).send(locale.invalid_credentials);
                break;
            case LOGIN.DISABLED:
                if (bruteForceProtection.hasOwnProperty(req.ip)) delete bruteForceProtection[req.ip];
                res.status(403).send(locale.account_disabled);
                break;
        }
        return loginResult;
    } else {
        res.redirect("/login");
    }
}

async function renewLoginToken(loginToken, req, res) {
    if ((loginToken.exp * 1000 - Date.now()) < 1 * 24 * 60 * 60 * 1000) {
        await createLoginTokenCookie(res, getID(req));
    }
}

function verifyToken(rawToken, req) {
    if (rawToken === undefined) return false;
    try {
        return jwt.verify(rawToken, secretKey);
    } catch (err) {
        if (req) {
            if (!(err instanceof jwt.TokenExpiredError || err instanceof jwt.NotBeforeError)) {
                firewall.blacklist.add(req.ip, 10 * 60 * 1000)
            }
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
    createJwtToken: createJwtToken,
    doAuthorization: doAuthorization,
    generateSalt: generateSalt,
    getHash: getHash,
    getID: getID,
    getRedirectUrl: getRedirectUrl,
    login: login,
    verifyToken: verifyToken
};