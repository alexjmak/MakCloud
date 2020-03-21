const express = require('express');
const router = express.Router();
const accountManager = require('../accountManager');
const sharingManager = require('../sharingManager');
const authorization = require('../authorization');


router.get('/*', function(req, res, next) {


// Loading file from file system into typed array

    accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function (username) {
        res.render('photos', {username: username});
    });
});
module.exports = router;
