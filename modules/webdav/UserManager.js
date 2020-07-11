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

    UserManager.prototype.getUserByName = function(username, callback) {
        let _this = this;
        accountManager.getInformation("id", "lower(username)", username.toLowerCase(), function(id) {
            if (!username) {
                if (_this.users[id]) delete _this.users[id];
                return callback(Errors.UserNotFound);
            }
            accountManager.getAccountInfoHash(id, function(infoHash) {
                if ((_this.users[id] && _this.users[id].infoHash !== infoHash) || !_this.users[id]) {
                    accountManager.getInformation("privilege", "id", id, function(privilege) {
                        _this.users[id] = new User(id, infoHash, username, privilege, undefined, undefined)
                        callback(null, _this.users[id]);
                    });
                } else {
                    callback(null, _this.users[id]);
                }
            });


        })

    }

    UserManager.prototype.getUserByNamePassword = function (username, password, callback) {
        this.getUserByName(username, function(e, user) {
            if (e) return callback(e);
            authorization.checkPassword(user.uid, password, function(result) {
                switch (result) {
                    case authorization.LOGIN.SUCCESS:
                        if (user.key === undefined || user.iv === undefined)  {
                            encryptionManager.decryptEncryptionKey(user.uid, password, function(key, iv) {
                                if (key !== false) {
                                    user.key = key;
                                    user.iv = iv;
                                } else {
                                    user.key = null;
                                    user.iv = null;
                                    callback(null, user);
                                }

                            });
                        } else {
                            callback(null, user);
                        }

                        break;
                    case authorization.LOGIN.FAIL: case authorization.LOGIN.DISABLED:
                        callback(Errors.BadAuthentication);
                        break;
                }
            })
        });
    };

    return UserManager;
}());
module.exports = UserManager;
