const child_process = require('child_process');
const pidusage = require('pidusage');
const strftime = require('strftime');

let gameServer;
let allocatedMemory = 2048; //MB
let running = false;
let onCloseFunction;

function start(cwd) {
    log("[" + strftime("%H:%M:%S") + "]: Starting server...");
    gameServer = child_process.spawn('java',  ["-Xmx" +  allocatedMemory + "M",  "-Xms" + allocatedMemory + "M", "-jar", "server.jar", "nogui"], {cwd: cwd});

    running = true;

    gameServer.on('close', function (code) {
        running = false;
        log("[" + strftime("%H:%M:%S") + "]: Server stopped");
        if (onCloseFunction !== undefined) onCloseFunction(cwd);
        setOnCloseFunction(undefined);
    });

    gameServer.stdout.on("data", function(data) {
        log(data.toString().trimEnd());
    });

    return gameServer;
}

function isRunning() {
    return running;
}

function setOnCloseFunction(method) {
    onCloseFunction = method;
}

function getUsage(next) {
    if (!isRunning()) {
        if (next !== undefined) next();
        return;
    }
    pidusage(gameServer.pid, function(err, usage) {
        if (err === null) {
            usage.allocatedMemory = allocatedMemory * 1000000;
            if (next !== undefined) next(usage);
        } else next();

    });
}

function command(command) {
    if (gameServer != undefined) gameServer.stdin.write(command + "\n");
}

function log(text) {
    console.log("[Minecraft] " + text);
}

module.exports = {
    start: start,
    isRunning: isRunning,
    setOnCloseFunction: setOnCloseFunction,
    getUsage: getUsage,
    command: command
};