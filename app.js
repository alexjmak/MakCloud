const gameServer = require("./gameServer");

let log = [];

function command(command) {
    if (typeof command !== "object") console.log(command);
    else command = command.toString();
    command = command.trim();
    if (command.startsWith("/")) command = command.substring(1);
    if (gameServer.isRunning()) {
        switch (command) {
            case "exit":
                gameServer.setOnCloseFunction(function() {
                    process.exit();
                });
                gameServer.command("stop");
                break;
            case "restart":
                gameServer.setOnCloseFunction(function(cwd) {
                    gameServer.start(cwd);
                });
                gameServer.command("stop");
                break;
            default:
                gameServer.command(command);
                break;
        }

    } else {
        switch (command) {
            case "exit":
                process.exit();
                break;
            case "ping":
                console.log("pong");
                break;
            case "start":
                gameServer.start("./Minecraft");
                break;
            default:
                console.log("[MakCloud]: Command - '" + command + "' not found");
        }

    }

}

function getLog() {
    return log;
}

console.log = function(text) {
    process.stdout.write(text + "\n");
    log.push(text);
};

module.exports = {
    command: command,
    getLog: getLog
};

const webServer = require("./webServer");
webServer.start();

//gameServer.start("./Minecraft");

process.stdin.on("data", command);


