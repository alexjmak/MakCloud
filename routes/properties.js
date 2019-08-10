const express = require('express');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const accountManager = require('../accountManager');
const authorization = require('../authorization');

const router = express.Router();

router.get('/', function(req, res) {
    accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function(username) {
        res.render('properties', {username: username, hostname: os.hostname()});
    });
});

router.get('/hash', function(req, res) {
    const fileContents = fs.readFileSync("./Minecraft/server.properties");
    res.send(crypto.createHash('md5').update(fileContents).digest('hex'));
});

router.post('/update', function(req, res) {
    accountManager.getInformation("privilege", "id", authorization.getLoginTokenAudience(req), function(privilege) {
        if (privilege > 0) {
            let fileContents = fs.readFileSync("./Minecraft/server.properties").toString();
            let keys = Object.keys(req.body);
            for (let key in keys) {
                if (keys.hasOwnProperty(key)) {
                    key = keys[key];
                    let newFileContents = fileContents.replace(new RegExp("^" + key + "=.*", "m"), key + "=" + req.body[key]);
                    if (fileContents === newFileContents) {
                        newFileContents = fileContents.trim() + "\n" + key + "=" + req.body[key];
                    }
                    fileContents = newFileContents;
                }
            }
            fs.writeFile("./Minecraft/server.properties", fileContents, function(err) {
                if (err) return res.status(404).send("Cannot update server properties");
                res.send("Updated " + keys.length + " properties");
            });
        } else {
            res.status(401).send("Insufficient privilege level");
        }
    });
});

module.exports = router;
