const fs = require('fs');
const jwt = require("jsonwebtoken");
const database = require("./databaseInit");
const crypto = require("crypto");
const firewall = require("./firewall");
const createError = require("http-errors");

const accountManager = require("./accountManager");
const localeManager = require("./localeManager");
const serverID = require("./serverID");
const keys = require("./keys");
const log = require("./log");
const preferences = require("./preferences");

const secretKey = keys.jwt.secret;

const LOGIN = {"SUCCESS": 0, "FAIL": 1, "DISABLED": 2};

const bruteForceProtection = {};

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

async function checkPrivilege(req, res, next, minimumPrivilege) {
    const id = getID(req);
    const privilege = await accountManager.getInformation("privilege", "id", id);
    if (privilege >= minimumPrivilege) next();
    else next(createError(403));
}

function createJwtToken(payload, maxAge) {
    return new Promise((resolve, reject) => {
        if (!maxAge) maxAge = preferences.get("loginMaxAge");
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
    if (!maxAge) maxAge = preferences.get("loginMaxAge");
    const token = await createJwtToken({sub: "loginToken", aud: id}, maxAge);
    res.cookie("loginToken", token, {maxAge: maxAge, path: "/", secure: true, sameSite: "strict"});
    return token;
}

async function doAuthorization(req, res, next) {
    let redirect = getRedirectUrl(req);
    const authorizationToken = await isAuthorized(req)
    if (authorizationToken) {
        await renewLoginToken(authorizationToken, req, res);
        return next();
    }
    res.redirect("/logout" + redirect);
}

function generateSalt() {
    return crypto.randomBytes(16).toString("hex");
}

function getHash(password, salt) {
    return crypto.createHmac('sha512', salt).update(password).digest('hex');
}

function getID(req) {
    const cookieName = "loginToken";
    if (!req.cookies[cookieName]) return null;
    const verifiedToken = verifyToken(req.cookies[cookieName], req);
    if (verifiedToken) return verifiedToken.aud;
    else return null;
}

function getRedirectUrl(req) {
    let redirect = req.originalUrl.startsWith("/") ? req.originalUrl.substring(1) : req.originalUrl;
    if (redirect !== "") redirect = "?redirect=" + redirect;
    return redirect;
}

async function isAuthorized(req) {
    let authorizationToken = null;
    if (req.cookies.loginToken) {
        authorizationToken = req.cookies.loginToken;
    }

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
        authorizationToken = req.headers.authorization.substring("Bearer ".length);
    }
    const verifiedToken = verifyToken(authorizationToken, req);
    const isValidPayload = validPayload(verifiedToken, {sub: "loginToken"})
    const accountExists = await accountManager.idExists(getID(req), true);
    if (isValidPayload && accountExists) return verifiedToken;
    else return false;
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
                    res.status(429).send(locale.too_many_attempts.replace("{0}", bruteForceProtection[req.ip]));
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

function validPayload(token, payload) {
    if (!token) return false;
    for (let key in payload)  {
        if (!payload.hasOwnProperty(key)) continue;
        if (!token.hasOwnProperty(key)) return false;
        if (payload[key] !== token[key]) return false;
    }
    return token.iss === serverID;
}

function verifyToken(rawToken, req) {
    if (!rawToken) return null;
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
    return null;
}

module.exports = {
    LOGIN: LOGIN,
    checkCredentials: checkCredentials,
    checkPassword: checkPassword,
    checkPrivilege: checkPrivilege,
    createJwtToken: createJwtToken,
    doAuthorization: doAuthorization,
    generateSalt: generateSalt,
    getHash: getHash,
    getID: getID,
    getRedirectUrl: getRedirectUrl,
    isAuthorized: isAuthorized,
    login: login,
    validPayload: validPayload,
    verifyToken: verifyToken
};