const express = require('express');
const createError = require('http-errors');
const https = require("https");
const fs = require("fs");
const path = require("path");
const cookieParser = require('cookie-parser');
const fileUpload = require("express-fileupload");
const helmet = require("helmet");
const session = require("express-session");
const MemoryStore = require("memorystore")(session);

const serverID = require("./core/serverID");
const authorization = require('./authorization');
const accountManager = require('./accountManager');
const firewall = require('./core/firewall');
const webdav = require('./webdav/webdav');
const log = require("./core/log");
const preferences = require("./preferences");

const app = express();

if (preferences.get("webdav")) {
    app.use(webdav.handler("/webdav"));
    app.use(webdav.handler("/makdav"));
}

const accountsRouter = require('./routes/accounts');
const filesRouter = require('./routes/files');
const photosRouter = require('./routes/photos');
const mailRouter = require('./routes/mail');
const firewallRouter = require('./routes/firewall');
const sharedRouter = require('./routes/shared');
const indexRouter = require('./routes/index');
const logRouter = require('./routes/log');
const loginRouter = require('./routes/login');
const logoutRouter = require('./routes/logout');
const updateRouter = require('./routes/update');
const errorRouter = require('./routes/error');

let serverInstances = [];

log.write("Starting server...");


app.use(helmet());
app.use(cookieParser());
app.use(fileUpload());
app.use(express.json());

app.use(session({
    name: "encryptionSession",
    secret: serverID,
    store: new MemoryStore({
       checkPeriod: 1 * 60 * 60 * 1000
    }),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true, sameSite: true, maxAge: 1 * 60 * 60 * 1000}
}));


app.use(function(req, res, next) {
    if (req.path.endsWith("/") && req.path !== "/") {
        res.redirect(req.path.substring(0, req.path.length - 1));
    } else {
        next();
    }
});

const noLog = ["/accounts/list/hash", "/log/raw", "/log/size"];
app.use(function(req, res, next) {
    if (noLog.indexOf(req.path) === -1) log.writeServer(req, req.method, req.url);
    next();
});

app.use(express.static(path.join(__dirname, "static")));

app.use('/logout', logoutRouter);
if (preferences.get("blacklist")) app.use(firewall.blacklist.enforce);
if (preferences.get("whitelist")) app.use(firewall.whitelist.enforce);
app.use('/login', loginRouter);
app.use("/shared", sharedRouter);
app.use("/update", updateRouter);
app.use(authorization.doAuthorization);
app.use('/', indexRouter);
app.use("/log", logRouter);
app.use("/logs", filesRouter);
app.use("/files", filesRouter);
app.use("/firewall", firewallRouter);
app.use("/public", filesRouter);
app.use("/photos", photosRouter);
app.use("/mail", mailRouter);
app.use("/accounts", accountsRouter);
app.use("/error", errorRouter);

app.enable("trust proxy");

app.use(function(req, res, next) {
    next(createError(404));
});

app.use(function(err, req, res, next) {
    log.writeServer(req, req.method, req.url + " (" + (err.status || 500) + " " + err.message + ")");
    res.status(err.status || 500);
    if (res.headersSent) return;
    accountManager.getInformation("username", "id", authorization.getID(req), function(username) {
        res.render('error', {message: err.message, status: err.status, username: username});
    });
});

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');


function start() {
    let httpsServer = https.createServer({
        key: fs.readFileSync("./keys/https/key.key"),
        cert: fs.readFileSync("./keys/https/cert.crt")
    }, app);
    httpsServer.listen(443);

    let httpServer = httpRedirectServer();

    serverInstances.push(httpsServer, httpServer);

    return serverInstances;
}


function httpRedirectServer() {
    let httpServer = express();
    httpServer.get('*', function(req, res) {
        res.redirect('https://' + req.headers.host + req.url);
    });
    httpServer = httpServer.listen(80);
    return httpServer;
}

module.exports = {
    start: start
};