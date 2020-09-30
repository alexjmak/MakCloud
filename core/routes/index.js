const express = require('express');
const render = require('../render');

const router = express.Router();

router.get("/", function (req, res, next) {
    render("layout", null, req, res, next);
});

module.exports = router;