process.chdir(__dirname);

let log = [];

function getLog() {
    return log;
}

console.log = function(text) {
    process.stdout.write(text + "\n");
    log.push(text);
};

require("./preferences");

module.exports = {
    getLog: getLog
};

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const webServer = require("./webServer");
webServer.start();

//process.stdin.on("data", command);
