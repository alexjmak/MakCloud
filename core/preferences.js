const fs = require('fs');
const log = require('./log');
const localeManager = require("./localeManager");

const configurationFile = "preferences.json";
let defaultConfiguration = {"blacklist": true, "whitelist": false, "serviceName": null};
let configuration;

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

function init() {
    let data;
    try {
        data = fs.readFileSync(configurationFile);
    } catch {
        fs.writeFileSync(configurationFile, JSON.stringify(defaultConfiguration));
        return init();
    }
    data = data.toString().trim();
    log.write(`Reading ${configurationFile}...`);
    log.write(data)
    try {
        configuration = JSON.parse(data);
        cleanup();
    } catch (err) {
        log.write("Read error: " + err);
        configuration = defaultConfiguration;
        save();
    }
}

function save() {
    fs.writeFileSync(configurationFile, JSON.stringify(configuration));
}

function setDefaultConfiguration(configuration) {
    Object.assign(defaultConfiguration, configuration);
}

module.exports = {
    get: get,
    init: init,
    setDefaultConfiguration: setDefaultConfiguration
};