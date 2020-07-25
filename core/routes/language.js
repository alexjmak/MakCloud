const express = require("express");
const router = express.Router();

const localeManager = require("../localeManager");

router.get("/", function(req, res, next) {

})

router.put("/update", function(req, res, next) {
    const locale = req.body.locale;
    if (locale && localeManager.isSupported(locale)) {
        res.cookie("locale", locale)
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }

})

module.exports = router;