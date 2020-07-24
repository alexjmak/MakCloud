let filesRouter = require("./files");
let path = require("path");
let preferences = require("../preferences");

let router = filesRouter(req => path.join(preferences.get("files"), "public"), false);

module.exports = router;