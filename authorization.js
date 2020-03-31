const fs = require('fs');
const jwt = require("jsonwebtoken");
const database = require("./databaseInit");
const crypto = require("crypto");
const pbkdf2 = require("pbkdf2");
const child_process = require("child_process");
const strftime = require('strftime');
const accountManager = require("./accountManager");
const preferences = require("./preferences");

const secretKey = fs.readFileSync('./keys/jwt/secret.key', 'utf8');
let serverID;

function loadServerID() {
    fs.readFile("SERVER_ID", function (err, data) {
        if (err) {
            fs.writeFileSync("SERVER_ID", generateSalt());
            return loadServerID();
        }
        data = data.toString();
        serverID = data;
    });
}

loadServerID();

function verifyToken(rawToken){
    if (rawToken === undefined) return false;
    try {
        let token = jwt.verify(rawToken, secretKey);
        return token;
    } catch (err) {
        log(err);
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
                if (next !== undefined) next();
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
        res.redirect("/logout" + originalUrl);
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
    accountManager.getInformation("id", "username", username.lower(), function(id) {
        if (id === undefined) {
            if (next !== undefined) next(1, id);
        } else {
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
                    res.status(200).send();
                    if (preferences.get()["sambaIntegration"]) {
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

function generatePbkdf2(id, password, next) {
    checkPassword(id, password, function(result) {
        if (result !== 0) {
            if (next !== undefined) next(false);
        } else {
            accountManager.getInformation("salt", "id", id, function(salt) {
                pbkdf2.pbkdf2(password, salt, 1, 32, 'sha512', function(nothing, pbkdf2) {
                    if (next !== undefined) next(pbkdf2);
                });
            });
        }
    });
}
function generateEncryptionKey(id, password, next) {
    generatePbkdf2(id, password, function (pbkdf2) {
        if (pbkdf2 === false) {
            if (next !== undefined) next(false);
        } else {
            let iv = crypto.randomBytes(16);
            let key = crypto.randomBytes(32);
            console.log(key.toString("hex"));
            let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(pbkdf2), iv);
            let encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
            encrypted = encrypted.toString("hex");
            iv = iv.toString("hex");
            if (next !== undefined) next(encrypted, iv);
        }
    });

}

function decryptEncryptionKey(id, password, next) {
    generatePbkdf2(id, password, function(pbkdf2) {
        if (pbkdf2 === false) {
            if (next !== undefined) next(false);
        } else {
            accountManager.getInformation("encryptKey", "id", id, function(key) {
                accountManager.getInformation("encryptIV", "id", id, function(iv) {
                    if (iv === null) {
                        if (next !== undefined) next(false);
                    } else {
                        iv = Buffer.from(iv, "hex");
                        key = Buffer.from(key, 'hex');
                        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(pbkdf2), iv);
                        let decrypted = Buffer.concat([decipher.update(key), decipher.final()]);
                        decrypted = decrypted.toString("hex");
                        if (next !== undefined) next(decrypted);
                    }
                });
            });
        }
    });
}

function generateSalt() {
    return crypto.randomBytes(16).toString("hex");
}

function getHash(password, salt) {
    return crypto.createHmac('sha512', salt).update(password).digest('hex');
}

function log(req, text) {
    if (typeof req === "string") {
        text = req;
        console.log("[Authorization] [" + strftime("%H:%M:%S") + "]: " + text);
    } else {
        console.log("[Authorization] [" + strftime("%H:%M:%S") + "] [" + (req.ip) + "]: " + req.method + " " + text);
    }
}

module.exports = {
    verifyToken: verifyToken,
    getLoginTokenAudience: getLoginTokenAudience,
    checkPayload: checkPayload,
    createToken: createToken,
    generateEncryptionKey: generateEncryptionKey,
    decryptEncryptionKey: decryptEncryptionKey,
    generateSalt: generateSalt,
    doAuthorization: doAuthorization,
    checkCredentials: checkCredentials,
    checkPassword: checkPassword,

    login: login,
    getHash: getHash
};