const webdav = require("webdav-server").v2;
const log = require("../log");
const preferences = require("../preferences");
const UserManager = require("./UserManager");
const UserFileSystem = require("./UserFileSystem");
const PrivilegeManager = require("./PrivilegeManager");

// User manager (tells who are the users)
const userManager = new UserManager();


// Privilege manager (tells which users can access which files/folders)
const privilegeManager = new PrivilegeManager();

const server = new webdav.WebDAVServer({
    requireAuthentication: true,
    httpAuthentication: new webdav.HTTPBasicAuthentication(userManager, 'Default realm'),
    privilegeManager: privilegeManager,
    serverName: "MakCloud",
    port: 1900, // Load the server on the port 2000 (if not specified, default is 1900)

});


server.afterRequest((arg, next) => {
    // Display the method, the URI, the returned status code and the returned message
    log.write(arg.requested.uri, '>', arg.response.statusCode, arg.response.statusMessage);
    next();
});


server.setFileSystem("Files", new UserFileSystem("./files", "files"), (success) => {
    server.setFileSystem("Photos", new UserFileSystem("./files", "photos", false), (success) => {
        server.setFileSystem("Public", new webdav.PhysicalFileSystem("./files/public/files", false), (success) => {
            server.start();
        });

    })

})



let handler = function(root) {
    return webdav.extensions.express(root, server);
};

module.exports = {handler: handler};
