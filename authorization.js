const fs = require('fs');
const jwt = require("jsonwebtoken");
const database = require("./databaseInit");
const crypto = require("crypto");
const pbkdf2 = require("pbkdf2");
const child_process = require("child_process");
const strftime = require('strftime');
const accountManager = require("./accountManager");
const encryptionManager = require("./encryptionManager");
const preferences = require("./preferences");
const serverID = require("./serverID");
const log = require("./log");

const secretKey = fs.readFileSync('./keys/jwt/secret.key', 'utf8');

function verifyToken(rawToken){
    if (rawToken === undefined) return false;
    try {
        let token = jwt.verify(rawToken, secretKey);
        return token;
    } catch (err) {
        log.write(err);
    }
    return false;
}

function createToken(payload, expiration) {
    if (payload.hasOwnProperty("iss")) delete payload.iss;
    if (expiration === undefined) expiration = "7d";
    payload = Object.assign({}, payload, {iss: serverID});
    return jwt.sign(payload, secretKey, {expiresIn: expiration});
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

function getLoginTokenAudience(req, cookieName) {
    if (cookieName === undefined) cookieName = "loginToken";
    if (req.cookies[cookieName] === undefined) return;
    return verifyToken(req.cookies[cookieName]).aud;
}

async function doAuthorization(req, res, next) {
    let redirect = req.originalUrl.startsWith("/") ? req.originalUrl.substring(1) : req.originalUrl;
    if (redirect !== "") redirect = "?redirect=" + redirect;

    function checkAccount() {
        accountManager.accountExists(getLoginTokenAudience(req), true, function(exists) {
            if (exists) {
                encryptionManager.checkEncryptionSession(req, function(valid) {
                    if (valid) {
                        if (next !== undefined) next();
                    } else {
                        res.redirect("/logout" + redirect);
                    }
                });
            } else res.redirect("/logout" + redirect);
        });
    }
    if (req.headers.authorization !== undefined) {
        if (req.headers.authorization.startsWith("Bearer ")) {
            let loginToken = verifyToken(req.headers.authorization.substring("Bearer ".length));
            if (loginToken !== false && checkPayload(loginToken, {sub: "loginToken"})) {
                checkAccount();
                return;
            }
        }
        res.redirect("/logout" + redirect);
    } else if (req.cookies.loginToken !== undefined) {
        let loginToken = verifyToken(req.cookies.loginToken);
        if (loginToken !== false && checkPayload(loginToken, {sub: "loginToken"})) {
            checkAccount();
            return;
        }
        res.redirect("/logout" + redirect);
    } else {
        res.redirect("/login" + redirect);
    }
}

function checkCredentials(username, password, next) {
    database.get("SELECT id FROM accounts WHERE lower(username) = ?", username.toLowerCase(), function(result) {
        if (result === undefined) {
            if (next !== undefined) next(1, result);
        } else {
            let id = result.id;
            checkPassword(id, password, function(result) {
                if (next !== undefined) next(result, id);
            })
        }
    })
}

function checkPassword(id, password, next) {
    database.get("SELECT * FROM accounts WHERE id = ?", id, function(result) {
        if (result !== false) {
            let hash = result["hash"];
            let salt = result["salt"];
            let enabled = result["enabled"] === 1;
            if (hash === getHash(password, salt)) {
                if (enabled && next !== undefined) next(0, id);
                else if (next !== undefined) next(2);
            } else if (next !== undefined) next(1);
        } else {
            if (next !== undefined) next(1);
        }
    });
}

async function login(req, res) {
    if (req.headers.authorization !== undefined) {
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const strauth = new Buffer.from(b64auth, 'base64').toString();
        const splitIndex = strauth.indexOf(':');
        const username = strauth.substring(0, splitIndex);
        const password = strauth.substring(splitIndex + 1);

        checkCredentials(username, password, function(result, id) {
            switch(result) {
                case 0:
                    res.cookie("loginToken", createToken({sub: "loginToken", aud: id}), {path: "/", secure: true, sameSite: "strict"});
                    encryptionManager.decryptEncryptionKey(id, password, function(key, iv) {
                        if (key !== false) {
                            req.session.encryptionKey = key;
                            req.session.encryptionIV = iv;
                        }
                        res.status(200).send();
                    });
                    if (preferences.get("sambaIntegration")) {
                        child_process.exec("(echo " + password + "; echo " + password + ") | sudo smbpasswd -a " + username.toLowerCase(), function (err, stdout, stderr) {});
                    }
                    break;
                case 1:
                    res.status(403).send("Invalid username and/or password");
                    break;
                case 2:
                    res.status(403).send("Your account is disabled");
                    break;
            }

        })
    } else {
        res.redirect("/login");
    }
}

function generateSalt() {
    return crypto.randomBytes(16).toString("hex");
}

function getHash(password, salt) {
    return crypto.createHmac('sha512', salt).update(password).digest('hex');
}

module.exports = {
    verifyToken: verifyToken,
    getLoginTokenAudience: getLoginTokenAudience,
    checkPayload: checkPayload,
    createToken: createToken,
    generateSalt: generateSalt,
    doAuthorization: doAuthorization,
    checkCredentials: checkCredentials,
    checkPassword: checkPassword,
    login: login,
    getHash: getHash
};