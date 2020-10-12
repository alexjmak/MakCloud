const express = require("express");
const router = express.Router();

const localeManager = require("../localeManager");


router.get("/update", function (req, res, next) {
    const locale = req.query.locale;
    if (locale && localeManager.isSupported(locale)) {
        res.cookie("locale", locale, {maxAge: 100 * 365 * 24 * 60 * 60 * 1000, sameSite: "strict"})
        res.sendStatus(200);
    } else {
        res.clearCookie("locale")
        res.sendStatus(404);
    }
})

router.put("/update", function (req, res, next) {
    const locale = req.body.locale;
    if (locale && localeManager.isSupported(locale)) {
        res.cookie("locale", locale, {maxAge: 100 * 365 * 24 * 60 * 60 * 1000});
        res.sendStatus(200);
    } else {
        res.clearCookie("locale")
        res.sendStatus(404);
    }
})

module.exports = router;