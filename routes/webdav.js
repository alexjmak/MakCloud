const express = require('express');
const log = require('../log');

const router = express.Router();

router.all("/*", function(req, res, next) {
    log.writeServer(req, JSON.stringify(req.headers));
    next();
})

router.copy("/*", function(req, res, next) {
    res.sendStatus(200);
});

router.delete("/*", function(req, res, next) {
    res.sendStatus(200);
});

router.get("/*", function(req, res, next) {
    res.sendStatus(200);
})

router.head("/*", function(req, res, next) {
    res.sendStatus(200);
});

router.lock("/*", function(req, res, next) {
    res.sendStatus(200);
});

router.mkcol("/*", function(req, res, next) {
    res.sendStatus(200);
});

router.move("/*", function(req, res, next) {
    res.sendStatus(200);
});

router.options("/*", function(req, res, next) {
    //res.setHeader("DAV", 1);
    //res.setHeader("ALLOW", "COPY, DELETE, GET, HEAD, LOCK, MKCOL, MOVE, OPTIONS, POST, PROPFIND, PUT, UNLOCK");
    res.writeHead(200, {"DAV": 1, "ALLOW": "COPY, DELETE, GET, HEAD, LOCK, MKCOL, MOVE, OPTIONS, POST, PROPFIND, PUT, UNLOCK"});
});

router.post("/*", function(req, res, next) {
    res.sendStatus(200);
});

router.propfind("/*", function(req, res, next) {
    res.sendStatus(200);
});

router.put("/*", function(req, res, next) {
    res.sendStatus(200);
});

router.unlock("/*", function(req, res, next) {
    res.sendStatus(200);
});

module.exports = router;
