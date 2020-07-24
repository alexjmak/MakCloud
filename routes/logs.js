
const filesRouter = require("./files");
const accountManager = require("../core/accountManager");
const authorization = require("../core/authorization");
const express = require("express");

const router = express.Router();

router.use(function(req, res, next) {
    let id = authorization.getID(req);
    accountManager.getInformation("privilege", "id", id, function (privilege) {
        if (privilege === 100) next();
        else next(createError(403));
    });
});

router.use(filesRouter(req => "./logs", false))

module.exports = router;
