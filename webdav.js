const webdav = require("webdav-server").v2;
const log = require("./log");

const userManager = new webdav.SimpleUserManager();
const user = userManager.addUser('username', 'password', false);

// Privilege manager (tells which users can access which files/folders)
const privilegeManager = new webdav.SimplePathPrivilegeManager();
privilegeManager.setRights(user, '/', [ 'all' ]);

const server = new webdav.WebDAVServer({
    // HTTP Digest authentication with the realm 'Default realm'

    httpAuthentication: new webdav.HTTPDigestAuthentication(userManager, 'Default realm'),
    privilegeManager: privilegeManager,
    port: 2000, // Load the server on the port 2000 (if not specified, default is 1900)
    autoSave: { // Will automatically save the changes in the 'data.json' file
        treeFilePath: 'data.json'
    }
});

server.afterRequest((arg, next) => {
    log.write('>>', arg.request.method, arg.fullUri(), '>', arg.response.statusCode, arg.response.statusMessage);
    next();
});

server.setFileSystemSync('/', new webdav.PhysicalFileSystem('/test'));


let handler = function(root) {
    return webdav.extensions.express(root, server);
};

module.exports = {handler: handler};
