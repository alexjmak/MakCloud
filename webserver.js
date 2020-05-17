const express = require('express');
const createError = require('http-errors');
const https = require("https");
const fs = require("fs");
const path = require("path");
const cookieParser = require('cookie-parser');
const fileUpload = require("express-fileupload");
const session = require("express-session");
const helmet = require("helmet");
const serverID = require("./serverID");
const authorization = require('./authorization');
const accountManager = require('./accountManager');
const blacklist = require('./blacklist');
const webdav = require('./webdav/webdav');
const log = require("./log");

const app = express();
app.use(webdav.handler("/makdav"));


const accountsRouter = require('./routes/accounts');
const filesRouter = require('./routes/files');
const photosRouter = require('./routes/photos');
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
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true, sameSite: true}
}));


app.use(function(req, res, next) {
    if (req.path.endsWith("/") && req.path !== "/") {
        res.redirect(req.path.substring(0, req.path.length - 1));
    } else {
        next();
    }
});

app.use(express.static(path.join(__dirname, "static")));

const noLog = ["/accounts/list/hash", "/log/raw", "/log/size"];
app.use(function(req, res, next) {
    if (noLog.indexOf(req.path) === -1) log.writeServer(req, req.method, req.url);
    next();
});

app.use('/logout', logoutRouter);
app.use(function(req, res, next) {
    if (blacklist.contains(req.ip) || !req.ip) {
        next(createError(403, "Blacklisted from server"));
    } else {
        next();
    }
})
app.use('/login', loginRouter);
app.use("/shared", sharedRouter);
app.use("/update", updateRouter);
app.use(authorization.doAuthorization);
app.use('/', indexRouter);
app.use("/log", logRouter);
app.use("/files", filesRouter);
app.use("/public", filesRouter);
app.use("/photos", photosRouter);
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
    accountManager.getInformation("username", "id", authorization.getLoginTokenAudience(req), function(username) {
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

function stop(next) {
    for (let server in serverInstances) {
        if (serverInstances.hasOwnProperty(server)) {
            server = serverInstances[server];
            server.close();
        }
    }
    log.write("Server stopped");
    if (next !== undefined) next();
}

function restart() {
    stop(function() {
        start();
    })
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
    start: start,
    stop: stop,
    restart: restart
};