const fs = require('fs');
const path = require('path');
const log = require('./log');

const configurationFile = path.join(__dirname, "preferences.json");
const defaultConfiguration = {files: "./files", sambaIntegration: false, webdav: true};
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
            cleanup();
        } catch(err) {
            log.write("Read error: " + err);
        }
        if (next) next();
    });
}

function get(property) {
    if (configuration) {
        if (!configuration.hasOwnProperty(property)) {
            if (defaultConfiguration.hasOwnProperty(property)) {
                configuration[property] = defaultConfiguration[property];
                save();
            } else {
                log.write("Property '" + property + "' does not exist")
            }

        }
        return configuration[property];
    }
}

function cleanup() {
    let modified = false;
    for (let property in configuration) {
        if (configuration.hasOwnProperty(property) && !defaultConfiguration.hasOwnProperty(property)) {
            delete configuration[property];
            modified = true;
            log.write("Deleted unused configuration value: " + property);
        }
    }
    if (modified) {
        save();
    }
}

function save() {
    fs.writeFileSync(configurationFile, JSON.stringify(configuration));
}

module.exports = {get: get, reload: reload};