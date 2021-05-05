const express = require('express');
const logout = require("../core/routes/logout");
const router = express.Router();

router.get('/', function(req, res, next) {
    res.clearCookie("encryptionSession");
    res.clearCookie("encryptionTimeout");
    if (req.session !== undefined) req.session.destroy();
    next();
});

router.use(logout);

module.exports = router;
