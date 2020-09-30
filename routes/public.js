const filesRouter = require("../core/routes/files");
const preferences = require("../core/preferences");
const path = require("path");
const express = require("express");

const router = express.Router();

router.use(filesRouter(req => {
    return path.join(preferences.get("files"), "public");
}))

module.exports = router;
