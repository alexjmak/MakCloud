"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var User = /** @class */ (function () {
    function User(id, username, privilege) {
        this.uid = id;
        this.username = username;
        this.privilege = privilege;
    }
    return User;
}());
module.exports = User;
