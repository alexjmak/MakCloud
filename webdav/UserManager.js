"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

let accountManager = require("../accountManager");
let authorization = require("../authorization");

var User = require("./User");
var Errors_1 = require("webdav-server/lib/Errors");
var UserManager = /** @class */ (function () {
    function UserManager() {
        this.users = {
            __default: new User(-1, null, 0)
        };
    }

    UserManager.prototype.getDefaultUser = function (callback) {
        callback(this.users.__default);
    };

    UserManager.prototype.getUserByNamePassword = function (username, password, callback) {
        accountManager.getInformation("id", "username", username, function(id) {
            if (!username) {
                return callback(Errors_1.Errors.UserNotFound);
            }
            accountManager.getInformation("privilege", "id", id, function(privilege) {
                authorization.checkPassword(id, password, function(result) {
                    switch (result) {
                        case 0: //Success
                            callback(null, new User(id, username, privilege));
                            break;
                        case 1: //Bad credentials
                            callback(Errors_1.Errors.BadAuthentication);
                            break;
                        case 2: //Disabled
                            callback(Errors_1.Errors.UserNotFound);
                            break;
                    }
                })
            });

        })

    };
    return UserManager;
}());
module.exports = UserManager;
