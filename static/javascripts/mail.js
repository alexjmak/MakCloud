$(document).ready(function() {
    if (location.pathname === "/mail/trash") {
        $("#all-mail").removeClass("mdc-list-item--activated");
        $("#trash").addClass("mdc-list-item--activated");

    }
});