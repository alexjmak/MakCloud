const fs = require('fs');
const path = require('path');
const log = require('./log');

const configurationFile = path.join(__dirname, "preferences.json");
const defaultConfiguration = {files: "./files", sambaIntegration: false};
let configuration;

function reload(next) {
    fs.readFile(configurationFile, function (err, data) {
        if (err) {
            fs.writeFileSync(configurationFile, JSON.stringify(defaultConfiguration));
            return reload();
        }
        data = data.toString().trim();
        log.write("Reading preferences: " + data);
        try {
            configuration = JSON.parse(data);
        } catch(err) {
            log.write("Read error: " + err);
        }
        if (next) next();
    });
}

function get(property) {
    if (configuration && configuration.hasOwnProperty(property)) {
        return configuration[property];
    }
}

module.exports = {get: get, reload: reload};