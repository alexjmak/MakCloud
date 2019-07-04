
String.format = function(format) {
    var args = Array.prototype.slice.call(arguments, 1);
    return format.replace(/{(\d+)}/g, function(match, number) {
        return typeof args[number] != 'undefined'
            ? args[number]
            : match
            ;
    });
};


var okDialog = "<div id=\"dialog\"" +
            "class=\"mdc-dialog\"" +
            "role=\"alertdialog\"" +
            "aria-modal=\"true\"" +
            "aria-labelledby=\"dialog-title\"" +
            "aria-describedby=\"dialog-content\">" +
            "<div class=\"mdc-dialog__container\">" +
            "<div class=\"mdc-dialog__surface\">" +
            "<h2 class=\"mdc-dialog__title\" id=\"dialog-title\">" +
            "{0}" +
            "</h2>" +
            " <div class=\"mdc-dialog__content\" id=\"dialog-content\">" +
            " {1}" +
            " </div>" +
            " <footer class=\"mdc-dialog__actions\">" +
            "<button type=\"button\" class=\"mdc-button mdc-dialog__button\" data-mdc-dialog-action=\"close\">" +
            "<span class=\"mdc-button__label\">OK</span>" +
            "</button>" +
            " </footer>" +
            " </div>" +
            "</div>" +
            "<div class=\"mdc-dialog__scrim\"></div>" +
            "</div>";

var yesNoDialog = "<div id=\"dialog\"" +
    "class=\"mdc-dialog\"" +
    "role=\"alertdialog\"" +
    "aria-modal=\"true\"" +
    "aria-labelledby=\"dialog-title\"" +
    "aria-describedby=\"dialog-content\">" +
    "<div class=\"mdc-dialog__container\">" +
    "<div class=\"mdc-dialog__surface\">" +
    "<h2 class=\"mdc-dialog__title\" id=\"dialog-title\">" +
    "{0}" +
    "</h2>" +
    "<div class=\"mdc-dialog__content\" id=\"dialog-content\">" +
    "{1}" +
    "</div>" +
    "<footer class=\"mdc-dialog__actions\">" +
    "<button type=\"button\" class=\"mdc-button mdc-dialog__button\" data-mdc-dialog-action=\"close\">" +
    "<span class=\"mdc-button__label\">No</span>" +
    "</button>" +
    "<button type=\"button\" class=\"mdc-button mdc-dialog__button\" data-mdc-dialog-action=\"yes\">" +
    "<span class=\"mdc-button__label\">Yes</span>" +
    "</button>" +
    "</footer>" +
    "</div>" +
    "</div>" +
    "<div class=\"mdc-dialog__scrim\"></div>" +
    "</div>";

var showDialog = function(type, title, body, actionFunctions) {

    $("body").append(String.format(type, title, body));
    var dialog = new mdc.dialog.MDCDialog(document.querySelector('#dialog'));

    dialog.listen('MDCDialog:closed', function() {
        $("#dialog").remove();

        if (actionFunctions != undefined) {
            try {
                actionFunctions[event.detail.action]();
            } catch (e) {
            }
        }
    });

    dialog.open();

    return dialog;
};