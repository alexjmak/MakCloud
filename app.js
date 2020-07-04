process.chdir(__dirname);

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const preferences = require("./preferences");

preferences.reload(function() {
    const webServer = require("./webserver");
    webServer.start();
});