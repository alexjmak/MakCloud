const webdav = require("webdav-server").v2;
const log = require("./log");
const preferences = require("./preferences");

// User manager (tells who are the users)
const userManager = new webdav.SimpleUserManager();
const user = userManager.addUser('username', 'password', false);
const user2 = userManager.addUser('Alex Mak', '', false);

// Privilege manager (tells which users can access which files/folders)
const privilegeManager = new webdav.SimplePathPrivilegeManager();
privilegeManager.setRights(user, '/', [ 'all' ]);

const server = new webdav.WebDAVServer({
    httpAuthentication: new webdav.HTTPBasicAuthentication(userManager, 'Default realm'),
    privilegeManager: privilegeManager,

    port: 1900, // Load the server on the port 2000 (if not specified, default is 1900)

});


server.afterRequest((arg, next) => {
    // Display the method, the URI, the returned status code and the returned message
    console.log('>>', arg.request.method, arg.requested.uri, '>', arg.response.statusCode, arg.response.statusMessage);
    // If available, display the body of the response
    console.log(arg.responseBody);
    next();
});


server.setFileSystem("Files", new webdav.PhysicalFileSystem("./files/0/files"), (success) => {
    server.setFileSystem("Photos", new webdav.PhysicalFileSystem("./files/0/photos", false), (success) => {
        server.setFileSystem("Public", new webdav.PhysicalFileSystem("./files/public/files", false), (success) => {
            server.start();
        });

    })

})



let handler = function(root) {
    return webdav.extensions.express(root, server);
};

module.exports = {handler: handler};
