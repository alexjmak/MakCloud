const preferences = require("./core/preferences");

preferences.setDefaultConfiguration({
    httpRedirectServer: true,
    sambaIntegration: false,
    webdav: true,
    encryptionSessionMaxAge: 1 * 60 * 60 * 1000
});

module.exports = preferences;