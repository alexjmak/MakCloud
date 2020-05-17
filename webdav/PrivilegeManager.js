"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var PrivilegeManager_1 = require("webdav-server/lib/user/v2/privilege/PrivilegeManager");
var JSCompatibility_1 = require("webdav-server/lib/helper/JSCompatibility");
var Errors_1 = require("webdav-server/lib/Errors");
function standarizePath(path) {
    if (!path)
        path = '/';
    var startIndex = path.indexOf('://');
    if (startIndex !== -1) {
        path = path.substr(startIndex + 3);
        path = path.substr(path.indexOf('/') + 1);
    }
    path = path.replace(/\\/g, '/');
    var rex = /\/\//g;
    while (rex.test(path))
        path = path.replace(rex, '/');
    path = path.replace(/\/$/g, '');
    path = path.replace(/^([^\/])/g, '/$1');
    if (path.length === 0)
        path = '/';
    return path;
}
var PrivilegeManager = /** @class */ (function (_super) {
    __extends(PrivilegeManager, _super);
    function PrivilegeManager() {
        var _this = _super.call(this) || this;
        _this.rights = {};
        return _this;
    }

    PrivilegeManager.prototype.getRights = function (user, path) {
        if (!user || user.uid === -1)
            return [];
        return ["all"];
    };
    PrivilegeManager.prototype._can = function (fullPath, user, resource, privilege, callback) {
        if (!user)
            return callback(null, false);
        var rights = this.getRights(user, fullPath.toString());
        var can = !!rights && rights.some(function (r) { return r === 'all' || r === privilege; });
        callback(null, can);
    };
    return PrivilegeManager;
}(PrivilegeManager_1.PrivilegeManager));
module.exports = PrivilegeManager;
