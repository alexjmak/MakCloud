let log = [];

function getLog() {
    return log;
}

console.log = function(text) {
    process.stdout.write(text + "\n");
    log.push(text);
};

module.exports = {
    getLog: getLog
};

const webServer = require("./webServer");
webServer.start();

//process.stdin.on("data", command);

