const webdav = require("webdav-server").v2;
const log = require("../core/log");
const preferences = require("../preferences");
const UserManager = require("./UserManager");
const UserFileSystem = require("./UserFileSystem");
const PrivilegeManager = require("./PrivilegeManager");
const path = require("path");

// User manager (tells who are the users)
const userManager = new UserManager();


// Privilege manager (tells which users can access which files/folders)
const privilegeManager = new PrivilegeManager();

const server = new webdav.WebDAVServer({
    requireAuthentication: true,
    httpAuthentication: new webdav.HTTPBasicAuthentication(userManager, 'Default realm'),
    privilegeManager: privilegeManager,
    serverName: "MakCloud",
    port: null
});


server.afterRequest((arg, next) => {
    if (arg.response.statusCode !== 200) {
        log.writeServer(arg.request, arg.request.method, arg.requested.uri, "(" + arg.response.statusCode, arg.response.statusMessage + ")");
    }
    next();
});

server.beforeRequest((arg, next) => {
    log.writeServer(arg.request, arg.request.method, arg.requested.uri);
    if (arg.request.method === "GET" && arg.requested.uri === "/") arg.response.redirect("/");
    next();
})


let filesPath = preferences.get("files");
server.setFileSystem("Files", new UserFileSystem(filesPath, "files"), (success) => {
    server.setFileSystem("Photos", new UserFileSystem(filesPath, "photos", false), (success) => {
        server.setFileSystem("Public", new webdav.PhysicalFileSystem(path.join(filesPath, "public/files"), false), (success) => {
            log.write("Starting server...")
            server.start();
        });
    });
});

let handler = function(root) {
    return webdav.extensions.express(root, server);
};

module.exports = {handler: handler};
