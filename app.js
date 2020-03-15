const webServer = require("./webServer");
let webserverInstance;

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

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

webserverInstance = webServer.start();

function stop() {
    webServer.stop();
}

function restart() {
    webServer.restart();
}

module.exports = {
    getLog: getLog,
    restart: restart,
    stop: stop
};
//process.stdin.on("data", command);
