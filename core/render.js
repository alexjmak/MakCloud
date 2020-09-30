const localeManager = require("./localeManager");
const os = require("os");
const path = require("path");
const fs = require("fs");

const viewsDirectory = "./views";
const coreViewsDirectory = "./core/views";
const extension = ".pug";

async function render(view, args, req, res, next) {
    const accountManager = require("./accountManager");
    const authorization = require("./authorization");

    const id = authorization.getID(req);

    let appViewFile = path.join(viewsDirectory, view);
    let coreViewFile = path.join(coreViewsDirectory, view);
    let viewFile;

    try {
        await fs.promises.stat(appViewFile + extension)
        viewFile = appViewFile;
    } catch {
        viewFile = coreViewFile;
    }

    if (id) {
        try {
            const username = await accountManager.getInformation("username", "id", id);
            args = Object.assign({}, args, {
                id: id,
                username: username
            })
        } catch {
        }
    }

    res.render(viewFile, Object.assign({
        hostname: os.hostname(),
        locale: localeManager.get(req)
    }, args));

}

module.exports = render;