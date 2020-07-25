const createError = require('http-errors');
const crypto = require('crypto');
const express = require('express');
const os = require('os');

const firewall = require('../firewall');
const accountManager = require('../../accountManager');
const authorization = require('../../authorization');
const render = require('../render');

const router = express.Router();

router.use(function(req, res, next) {
    let id = authorization.getID(req);
    accountManager.getInformation("privilege", "id", id, function(privilege) {
        if (privilege === 100) next();
        else next(createError(403));
    });
});

router.delete('/delete', function(req, res, next) {
    let ip = req.body.ip;
    let list = req.body.list;
    if (hasFields(res, ip, list)) {
        firewall.remove(ip, list, function(result) {
            if (result) {
                res.sendStatus(200);
            } else {
                res.sendStatus(400);
            }
        });
    }
});

router.get('/blacklist', function(req, res, next) {
    render('firewall', {list: 0}, req, res, next);
});

router.get('/blacklist/list', function(req, res) {
    firewall.blacklist.get(function(list) {
        let dictionary = {};
        for (let entry of list) {
            dictionary[entry.ip] = entry;
        }
        res.json(dictionary);
    });
});

router.get('/whitelist', function(req, res, next) {
    render('firewall', {list: 1}, req, res, next);
});


router.get('/whitelist/list', function(req, res) {
    firewall.whitelist.get(function(list) {
        let dictionary = {};
        for (let entry of list) {
            dictionary[entry.ip] = entry;
        }
        res.json(dictionary);
    });
});

router.patch('/end', function(req, res, next) {
    let ip = req.body.ip;
    let list = req.body.list;
    let newEnd = parseInt(req.body.new_end);
    if (hasFields(res, ip, list, newEnd)) {
        firewall.modifyEnd(ip, list, newEnd, function(result) {
            if (result) {
                res.sendStatus(200);
            } else {
                res.sendStatus(400);
            }
        });
    }
});

router.patch('/ip', function(req, res, next) {
    let ip = req.body.ip;
    let list = req.body.list;
    let newIp = req.body.new_ip;
    if (hasFields(res, ip, list, newIp)) {
        firewall.modifyIp(ip, list, newIp, function(result) {
            if (result) {
                res.sendStatus(200);
            } else {
                res.sendStatus(400);
            }
        });
    }
});

router.patch('/start', function(req, res, next) {
    let ip = req.body.ip;
    let list = req.body.list;
    let newStart = parseInt(req.body.new_start);
    if (hasFields(res, ip, list, newStart)) {
        firewall.modifyStart(ip, list, newStart, function(result) {
            if (result) {
                res.sendStatus(200);
            } else {
                res.sendStatus(400);
            }
        });
    }
});

router.put('/new', function(req, res) {
    let ip = req.body.ip;
    let list = req.body.list;
    let start = parseInt(req.body.start);
    let length = parseInt(req.body.length);
    if (hasFields(res, ip, list, length)) {
        firewall.contains(ip, list, function(result) {
            if (!result) {
                firewall.add(ip, list, length, function(result) {
                    if (result) {
                        res.sendStatus(200);
                    } else {
                        res.sendStatus(400);
                    }
                });
            } else {
                res.sendStatus(400);
            }

        });
    }
});

function hasFields(res, ...fields) {
    for (let field in fields) {
        field = fields[field];
        if (field === undefined) {
            res.status(400).send("Missing required fields");
            return false;
        }
    }
    return true;
}

module.exports = router;
