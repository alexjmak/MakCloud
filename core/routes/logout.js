const express = require('express');

const router = express.Router();

router.get('/', function (req, res, next) {
    res.clearCookie("loginToken");
    res.clearCookie("fileToken");
    let redirect = req.query.redirect;
    if (redirect) res.redirect("/login?redirect=" + redirect);
    else res.redirect("/login");
});

module.exports = router;
