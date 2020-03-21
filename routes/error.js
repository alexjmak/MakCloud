const express = require('express');
const createError = require('http-errors');

const router = express.Router();

router.get('/', function(req, res, next) {
    let error = req.query.code;
    error = isNaN(error) ? 500 : Number.parseInt(error);
    next(createError(error));
});

module.exports = router;
