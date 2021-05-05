const encryptionManager = require("./encryptionManager");
const preferences = require("./preferences");

const authorization = require("./core/authorization");
const terminal = require("./core/terminal");

async function doAuthorization(req, res, next) {
    return await authorization.doAuthorization(req, res, async function() {
        const validEncryptionSession = await encryptionManager.checkEncryptionSession(req);
        if (validEncryptionSession) {
            if (req.session.encryptionKey) encryptionManager.setEncryptionEnabledCookie(res);
            next();
        } else {
            let redirect = authorization.getRedirectUrl(req);
            res.redirect("/logout" + redirect);
        }
    });
}

async function isAuthorized(req) {
    const isAuthorized = await authorization.isAuthorized(req);
    const validEncryptionSession = await encryptionManager.checkEncryptionSession(req);
    return isAuthorized && validEncryptionSession;
}

async function login(req, res, next) {
    return await authorization.login(req, res, next, async function(id, username, password) {
        const key = await encryptionManager.decryptEncryptionKey(id, password);
        if (key) {
            req.session.encryptionKey = key;
        }
        if (preferences.get("sambaIntegration")) {
            terminal("(echo " + password + "; echo " + password + ") | sudo smbpasswd -a " +
                username.toLowerCase(), null, false);
        }
    });
}

module.exports = Object.assign({}, authorization, {
    doAuthorization: doAuthorization,
    isAuthorized: isAuthorized,
    login: login,
});