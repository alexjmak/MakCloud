const filesRouter = require("./files");
const accountManager = require("../accountManager");
const authorization = require("../authorization");
const createError = require("http-errors");
const express = require("express");

const router = express.Router();

router.use((req, res, next) => authorization.checkPrivilege(req, res, next, 100));

router.use(filesRouter(req => "./logs", false))

module.exports = router;
