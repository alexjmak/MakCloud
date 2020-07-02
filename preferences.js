const preferences = require("./core/preferences");

preferences.setDefaultConfiguration({
    "files": "./files",
    "sambaIntegration": false,
    "webdav": true
});

module.exports = preferences;