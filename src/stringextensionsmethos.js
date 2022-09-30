"use strict";
exports.__esModule = true;
String.prototype.GetAuthToken = function () {
    if (this.includes(bearerStirng)) {
        return this.replace(bearerStirng, "");
    }
    return this;
};
