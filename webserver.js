const express = require('express');
const createError = require('http-errors');
const https = require("https");
const fs = require("fs");
const path = require("path");

//const fileUpload = require("./modules/express-fileupload");

const session = require("express-session");
const MemoryStore = require("memorystore")(session);

const serverID = require("./core/serverID");
const authorization = require('./authorization');
const accountManager = require('./accountManager');
const firewall = require('./core/firewall');
const localeManager = require('./core/localeManager');
const webdav = require('./modules/webdav/webdav');
const keys = require("./core/keys");
const log = require("./core/log");
const preferences = require("./preferences");
const render = require('./core/render');
const webserver = require("./core/webserver");

const app = webserver.start();

if (preferences.get("webdav")) {
    if (preferences.get("blacklist")) app.use("/webdav", firewall.blacklist.enforce);
    if (preferences.get("whitelist")) app.use("/webdav", firewall.whitelist.enforce);
    app.use(webdav.handler("/webdav"));
}

const accountsRouter = require('./routes/accounts');
const filesRouter = require('./routes/files')();
const publicRouter = require('./routes/public');
const photosRouter = require('./routes/photos');
const mailRouter = require('./routes/mail');
const sharedRouter = require('./routes/shared');
const indexRouter = require('./routes/index');
const loginRouter = require('./routes/login');
const logoutRouter = require('./routes/logout');




app.use(session({
    name: "encryptionSession",
    secret: serverID,
    store: new MemoryStore({
       checkPeriod: 1 * 60 * 60 * 1000
    }),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true, sameSite: "strict", maxAge: 1 * 60 * 60 * 1000}
}));



const noLog = ["/accounts/list/hash", "/log/raw", "/log/size"];
app.use(function(req, res, next) {
    if (noLog.indexOf(req.path) === -1) log.writeServer(req, req.method, req.url);
    next();
});

app.use(express.static("./static"));
app.use(express.static("./core/static"));
app.use("/core", express.static("./core/static"));

app.use(localeManager.getHandler());
app.use('/logout', logoutRouter);
if (preferences.get("blacklist")) app.use(firewall.blacklist.enforce);
if (preferences.get("whitelist")) app.use(firewall.whitelist.enforce);
app.use('/login', loginRouter);
app.use("/shared", sharedRouter());
app.use("/shared-with-me", sharedRouter());
app.use("/shared-with-others", sharedRouter());
app.use(authorization.doAuthorization);
app.use('/', indexRouter);
app.use("/files", filesRouter);
app.use("/public", publicRouter);
app.use("/photos", photosRouter);
app.use("/mail", mailRouter);
app.use("/accounts", accountsRouter);

app.use(function(req, res, next) {
    next(createError(404));
});

app.use(function (err, req, res, next) {
    log.writeServer(req, req.method, req.url + " (" + (err.status || 500) + " " + err.message + ")");
    res.status(err.status || 500);
    if (res.headersSent) return;
    render("error", {message: err.message, status: err.status}, req, res, next)
});

app.enable("trust proxy");


app.set('views', ".");
app.set('view engine', 'pug');


function start() {
    log.write(`Starting server on port ${preferences.get("port")}...`);
    const httpsServer = https.createServer(keys.https, app);
    httpsServer.listen(preferences.get("port"));
    if (preferences.get("httpRedirectServer")) {
        httpRedirectServer();
    }
}

function httpRedirectServer() {
    log.write(`Starting http redirect server on port 80...`);
    const httpServer = express();
    httpServer.get('*', function(req, res) {
        res.redirect('https://' + req.headers.host + req.url);
    });
    httpServer.listen(80);
}

module.exports = {
    app: app,
    start: start
};