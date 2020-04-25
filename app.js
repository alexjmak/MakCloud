process.chdir(__dirname);

const webServer = require("./webserver");

require("./preferences");

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

webServer.start();
