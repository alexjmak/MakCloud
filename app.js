const webServer = require("./webserver");

let webserverInstance;

process.chdir(__dirname);


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
    restart: restart,
    stop: stop
};
//process.stdin.on("data", command);
