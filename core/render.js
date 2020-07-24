const accountManager = require("./accountManager");
const authorization = require("./authorization");
const os = require("os");

function render(view, args, req, res, next) {
    const id = authorization.getID(req);
    if (id) {
        accountManager.getInformation("username", "id", id, function(username) {
            if (!username) return next();
            res.render(view, Object.assign({username: username, hostname: os.hostname()}, args));
        });
    } else {
        res.render(view, Object.assign({hostname: os.hostname()}, args));
    }
}

module.exports = render