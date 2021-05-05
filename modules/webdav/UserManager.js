"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

let accountManager = require("../../accountManager");
let authorization = require("../../authorization");
let encryptionManager = require("../../encryptionManager");

var User = require("./User");
var Errors = require("webdav-server/lib/Errors").Errors;

var UserManager = /** @class */ (function () {
    function UserManager() {
        this.users = {
            __default: new User(-1, null, 0)
        };
    }

    UserManager.prototype.getDefaultUser = function (callback) {
        callback(this.users.__default);
    };

    UserManager.prototype.getUserByName = async function(username, callback) {
        let _this = this;
        const id = await accountManager.getInformation("id", "lower(username)", username.toLowerCase());
        if (!id) {
            return callback(Errors.UserNotFound);
        }
        const infoHash = await accountManager.getAccountInfoHash(id);
        if ((_this.users[id] && _this.users[id].infoHash !== infoHash) || !_this.users[id]) {
            const privilege = await accountManager.getInformation("privilege", "id", id);
            _this.users[id] = new User(id, infoHash, username, privilege, undefined)
            callback(null, _this.users[id]);
        } else {
            callback(null, _this.users[id]);
        }
    }

    UserManager.prototype.getUserByNamePassword = function (username, password, callback) {
        this.getUserByName(username, async function(e, user) {
            if (e) return callback(e);
            const loginResult = await authorization.checkPassword(user.uid, password);
            switch (loginResult) {
                case authorization.LOGIN.SUCCESS:
                    if (user.key === undefined)  {
                        let key;
                        try {
                            key = await encryptionManager.decryptEncryptionKey(user.uid, password);
                        } catch {
                        }
                        if (key) {
                            user.key = key;
                        } else {
                            user.key = null;
                        }
                    }
                    callback(null, user);
                    break;
                case authorization.LOGIN.FAIL: case authorization.LOGIN.DISABLED:
                    callback(Errors.BadAuthentication);
                    break;
            }
        });
    };

    return UserManager;
}());
module.exports = UserManager;
