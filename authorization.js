const os = require("os");
const fs = require('fs');
const jwt = require("jsonwebtoken");
const database = require("./databaseInit");
const crypto = require("crypto");
const child_process = require("child_process");
const accountManager = require("./accountManager");

const secretKey = fs.readFileSync('./keys/jwt/secret.key', 'utf8');

const sambaIntegration = accountManager.sambaIntegration;

function verifyToken(rawToken){
    if (rawToken === undefined) return false;
    try {
        let token = jwt.verify(rawToken, secretKey);
        return token;
    } catch (err) {
        console.log(err);
    }
    return false;
}

function createToken(payload) {
    if (payload.hasOwnProperty("iss")) delete payload.iss;
    payload = Object.assign({}, payload, {iss: os.hostname()});
    return jwt.sign(payload, secretKey, {expiresIn: "7d"});
}

function checkPayload(token, payload) {
    if (token === false) return false;
    for (let key in payload)  {
        if (!payload.hasOwnProperty(key)) continue;
        if (!token.hasOwnProperty(key)) return false;
        if (payload[key] !== token[key]) return false;
    }
    if (token.iss !== os.hostname()) return false;
    return true;
}

function getLoginTokenAudience(req, cookieName) {
    if (cookieName === undefined) cookieName = "loginToken";
    if (req.cookies[cookieName] === undefined) return;
    return verifyToken(req.cookies[cookieName]).aud;
}

async function doAuthorization(req, res, next) {
    function checkAccount() {
        accountManager.accountExists(getLoginTokenAudience(req), true, function(exists) {
            if (exists) {
                if (next !== undefined) next();
            } else res.redirect("/logout");
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
        res.redirect("/logout");
    } else if (req.cookies.loginToken !== undefined) {
        let loginToken = verifyToken(req.cookies.loginToken);
        if (loginToken !== false && checkPayload(loginToken, {sub: "loginToken"})) {
            checkAccount();
            return;
        }
        res.redirect("/logout");
    } else res.redirect("/login");
}

async function login(req, res) {
    let response = "Invalid username and/or password";
    if (req.headers.authorization !== undefined) {
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const strauth = new Buffer.from(b64auth, 'base64').toString();
        const splitIndex = strauth.indexOf(':');
        const username = strauth.substring(0, splitIndex);
        const password = strauth.substring(splitIndex + 1);

        database.get("SELECT * FROM accounts WHERE lower(username) = ?", username.toLowerCase(), function(result) {
            if (result !== false) {
                let id = result["id"];
                let hash = result["hash"];
                let salt = result["salt"];
                let enabled = result["enabled"] === 1;
                if (hash === getHash(password, salt)) {
                    if (enabled) {
                        res.cookie("loginToken", createToken({sub: "loginToken", aud: id}), {path: "/", secure: true, sameSite: "strict"});
                        res.status(200).send();
                        if (sambaIntegration) {
                            child_process.exec("(echo " + password + "; echo " + password + ") | sudo smbpasswd -a " + username.toLowerCase(), function (err, stdout, stderr) {});
                        }
                    } else {
                        res.status(403).send("Your account is disabled");
                    }
                } else {
                    res.status(401).send(response);
                }
            } else {
                res.status(401).send(response);
            }

        });
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
    login: login,
    getHash: getHash
};