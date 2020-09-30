const filesRouter = require("./files");
const accountManager = require("../accountManager");
const authorization = require("../authorization");
const createError = require("http-errors");
const express = require("express");

const router = express.Router();

router.use(async function(req, res, next) {
    const id = authorization.getID(req);
    const privilege = await accountManager.getInformation("privilege", "id", id);
    if (privilege === 100) next();
    else next(createError(403));
});

router.use(filesRouter(req => "./logs", false))

module.exports = router;
