const path = require('path');
const strftime = require('strftime');

let log = [];

function get() {
    return log.join("\n");
}

function getCaller() {
    let origPrepareStackTrace = Error.prepareStackTrace
    let err = new Error();
    Error.prepareStackTrace = function (err, stack) { return stack; };
    let stack = err.stack;
    Error.prepareStackTrace = origPrepareStackTrace;
    for (let i = 0; i < err.stack.length; i++) {
        let fileName = err.stack[i].getFileName();
        if (fileName !== __filename) {
            return fileName;
        }
    }
    return __filename;
}

function formatFilename(fileName) {
    fileName = path.basename(fileName);
    fileName = fileName.substring(0, fileName.indexOf("."));
    fileName = fileName.split("");
    fileName[0] = fileName[0].toUpperCase();
    for (let i = 1; i < fileName.length; i++) {
        let char = fileName[i];
        let previousChar = fileName[i - 1];
        if (char === char.toUpperCase() && previousChar !== previousChar.toUpperCase()) {
            fileName.splice(i, 0, " ");
            i++;
        }
    }
    fileName = fileName.join("");
    return fileName;
}

function write(...text) {
    let name = formatFilename(getCaller());
    text = text.join(" ");
    let logString = "[" + name + "] [" + strftime("%H:%M:%S") + "]: " + text;
    console.log(logString);
    log.push(logString);
}

function writeServer(req, ...text) {
    let name = formatFilename(getCaller());
    text = text.join(" ");
    let logString = "[" + name + "] [" + strftime("%H:%M:%S") + "] [" + (req.ip) + "]: " + text;
    console.log(logString);
    log.push(logString);
}


module.exports = {get: get,
                  write: write,
                  writeServer: writeServer};