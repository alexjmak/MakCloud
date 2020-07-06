const express = require('express');

const router = express.Router();

router.get('/', function(req, res, next) {
    res.clearCookie("loginToken");
    res.clearCookie("fileToken");
    res.clearCookie("encryptionSession");
    if (req.session !== undefined) req.session.destroy();
    let redirect = req.query.redirect;
    if (redirect !== undefined) res.redirect("/login?redirect=" + redirect);
    else res.redirect("/login");
});

module.exports = router;
