const locale = require("locale");
const fs = require("fs");
const path = require("path");
const log = require("./log");

const extension = ".json";

const coreLocaleDirectory = path.join("core", "locales");
const localeDirectory = path.join(".", "locales");
let defaultLocale = "en_US";

let locales = {};
let handler;
let hasInit = false;

if (!hasInit) init();

function init() {
    log.write("Loading locales...")
    load(coreLocaleDirectory);
    load(localeDirectory);


    if (!locales.hasOwnProperty(defaultLocale)) defaultLocale = locales[0];

    handler = locale(Object.keys(locales), defaultLocale)
}


function load(directory) {
    let localeFiles = fs.readdirSync(directory)
    for (let localeFile of localeFiles) {
        if (localeFile.endsWith(extension)) {
            let localeName = localeFile.substring(0, localeFile.length - extension.length);
            try {
                let localeData = fs.readFileSync(path.join(directory, localeFile));
                localeData = localeData.toString();
                localeData = JSON.parse(localeData)
                if (locales[localeName]) {
                    Object.assign(locales[localeName], locales[localeName], localeData);
                } else locales[localeName] = localeData;
            } catch {
                log.write(`Invalid locale file: ${localeName}`);
            }
        }
    }
    if (locales.length === 0) {
        throw new Error("No locales found")
    }
}

function get(req) {
    let sessionLocale = defaultLocale;
    if (req) sessionLocale = req.locale;
    let localeData = locales[sessionLocale];
    if (sessionLocale !== defaultLocale) {
        let defaultLocaleData = locales[defaultLocale];
        localeData = Object.assign({}, defaultLocaleData, localeData);
    }
    return localeData;
}

function getHandler() {
    return handler;
}

function isSupported(locale) {
    return locales.hasOwnProperty(locale);
}

module.exports = {
    init: init,
    get: get,
    getHandler: getHandler,
    isSupported: isSupported,
}