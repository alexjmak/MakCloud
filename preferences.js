const fs = require('fs');
const path = require('path');

const configurationFile = path.join(__dirname, "preferences.conf");
const defaultConfiguration = {files: "./files", sambaIntegration: false};
let configuration;

function reload() {
    fs.readFile(configurationFile, function (err, data) {
        if (err) {
            fs.writeFileSync(configurationFile, JSON.stringify(defaultConfiguration));
            return reload();
        }
        data = data.toString();
        configuration = JSON.parse(data);
        console.log("Reading preferences: " + data);
    });
}

function get() {
    return configuration;
}

reload();

module.exports = {get: get, reload: reload};