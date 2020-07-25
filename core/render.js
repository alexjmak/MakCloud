const localeManager = require("./localeManager");
const os = require("os");
const path = require("path");
const fs = require("fs");

const viewsDirectory = "./views";
const coreViewsDirectory = "./core/views";
const extension = ".pug";

function render(view, args, req, res, next) {
    const accountManager = require("./accountManager");
    const authorization = require("./authorization");

    const id = authorization.getID(req);

    let viewFile = path.join(viewsDirectory, view);
    let coreViewFile = path.join(coreViewsDirectory, view);

    fs.stat(viewFile + extension, function (err, stat) {
        if (stat) {
            callback(viewFile);
        } else {
            callback(coreViewFile);
        }
    });

    function callback(view) {
        if (id) {
            accountManager.getInformation("username", "id", id, function(username) {
                if (!username) return next();
                res.render(view, Object.assign({username: username, hostname: os.hostname(), locale: localeManager.get(req)}, args));
            });
        } else {
            res.render(view, Object.assign({hostname: os.hostname(), locale: localeManager.get(req)}, args));
        }
    }

}

module.exports = render