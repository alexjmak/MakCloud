"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var User = /** @class */ (function () {
    function User(uid, infoHash, username, privilege, key, iv) {
        this.uid = uid;
        this.infoHash = infoHash
        this.username = username;
        this.privilege = privilege;
        this.key = key;
    }
    return User;
}());
module.exports = User;
