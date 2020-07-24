const encryptionManager = require("./encryptionManager");
const preferences = require("./preferences");

const authorization = require("./core/authorization");
const terminal = require("./core/terminal");

function doAuthorization(req, res, next) {
    authorization.doAuthorization(req, res, function(result) {
        if (result) {
            encryptionManager.checkEncryptionSession(req, function(valid) {
                if (valid) {
                    if (next !== undefined) next();
                } else {
                    let redirect = authorization.getRedirectUrl(req);
                    res.redirect("/logout" + redirect);
                }
            });
        }
    });
}

function login(req, res) {
    authorization.login(req, res, function(result) {
        if (result !== false) {
            let id = result[0]
            let username = result[1];
            let password = result[2];
            encryptionManager.decryptEncryptionKey(id, password, function(key, iv) {
                if (key !== false) {
                    req.session.encryptionKey = key;
                }
                res.status(200).send();
            });
            if (preferences.get("sambaIntegration")) {
                terminal("(echo " + password + "; echo " + password + ") | sudo smbpasswd -a " + username.toLowerCase(), null, null, false);
            }
        }
    });
}

module.exports = Object.assign({}, authorization, {
    doAuthorization: doAuthorization,
    login: login,
});