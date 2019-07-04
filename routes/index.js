const express = require('express');
const router = express.Router();
const path = require("path");
const fs = require("fs");
const MobileDetect = require("mobile-detect");
const os = require('os');
const url = require('url');
const accountManager = require('../accountManager');
const authorization = require('../authorization');

router.get('/', function(req, res, next) {
    res.redirect("/files");
});

module.exports = router;
