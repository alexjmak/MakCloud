const express = require('express');

const router = express.Router();

router.get('/', function(req, res, next) {
    res.clearCookie("loginToken");
    let redirect = req.query.redirect;
    if (redirect !== undefined) res.redirect("/login?redirect=" + redirect);
    res.redirect("/login");
});

module.exports = router;
