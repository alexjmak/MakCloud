const os = require("os");
const fs = require('fs');
const jwt = require("jsonwebtoken");
const accountManager = require("./accountManager");

const secretKey = fs.readFileSync('./keys/jwt/secret.key', 'utf8');

function verifyToken(rawToken){
    if (rawToken === undefined) return false;
    try {
        let token = jwt.verify(rawToken, secretKey);
        if (token.issuer === os.hostname()) return token;
    } catch (err) {
        console.log(err);
    }
    return false;
}

function createToken(subject) {
    return jwt.sign({issuer: os.hostname(), subject: subject}, secretKey, {expiresIn: "7d"});
}

function getTokenSubject(req) {
    if (req.cookies.token === undefined) return;
    return verifyToken(req.cookies.token).subject;
}

async function doAuthorization(req, res, next) {
    function checkAccount() {
        accountManager.accountExists(getTokenSubject(req), true, function(exists) {
            if (exists) {
                next();
            } else {
                res.redirect("/login");
            }
        });
    }

    if (req.headers.authorization != undefined) {
        if (req.headers.authorization.startsWith("Bearer ")) {
            if (verifyToken(req.headers.authorization.substring("Bearer ".length))) {
                checkAccount();
                return;
            }
        }
    } else if (req.cookies.token != undefined) {
        if (verifyToken(req.cookies.token)) {
            checkAccount();
            return;
        }
    }
    res.redirect("/login");
}

async function login(req, res) {
    let response = "Invalid username and/or password";
    if (req.headers.authorization !== undefined) {
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const strauth = new Buffer.from(b64auth, 'base64').toString();
        const splitIndex = strauth.indexOf(':');
        const username = strauth.substring(0, splitIndex);
        const password = strauth.substring(splitIndex + 1);

        accountManager.accountDatabase.get("SELECT * FROM accounts WHERE lower(username) = ?", username.toLowerCase(), function(result) {
            if (result !== false) {
                let id = result["id"];
                let hash = result["hash"];
                let salt = result["salt"];
                let enabled = result["enabled"] == 1;
                if (hash === accountManager.getHash(password, salt)) {
                    if (enabled) {
                        res.cookie("token", createToken(id), {path: "/", secure: true, sameSite: "strict"});
                        res.status(200).send();
                        return;
                    } else {
                        response = "Your account is disabled";
                    }
                }
            }
            res.status(401).send(response);
            return;
        });
    } else {
        res.status(401).send(response);
        return;
    }
}

module.exports = {
    verifyToken: verifyToken,
    getTokenSubject: getTokenSubject,
    doAuthorization: doAuthorization,
    login: login
};