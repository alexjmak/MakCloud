const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require("helmet");

const app = express();

function start() {
    const languageRouter = require('./routes/language');
    const firewallRouter = require('./routes/firewall');
    const logRouter = require('./routes/log');
    const logsRouter = require('./routes/logs');
    const updateRouter = require('./routes/update');

    app.use(helmet());
    app.use(cookieParser());
    app.use(express.json());

    app.use(function (req, res, next) {
        if (req.originalUrl === "/") return next();
        let urlCleanup = req.originalUrl
            .replace(/\/{2,}/g, "/")
            .replace(/\/$/, "");
        if (req.originalUrl !== urlCleanup) {
            return res.redirect(urlCleanup);
        }
        next();
    })


    app.use('/language', languageRouter);
    app.use("/update", updateRouter);
    app.use("/log", logRouter);
    app.use("/logs", logsRouter);
    app.use("/firewall", firewallRouter);
    return app;
}





module.exports = {app: app, start: start};