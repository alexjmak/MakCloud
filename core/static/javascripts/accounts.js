let accountFieldValues;
let passwordDialog;

let deletedMode = window.location.href.match("/deleted") !== null;

$(document).ready(function() {
    getAccountInfo(displayAccountInfo);
});

$(document).keypress(function(e) {
    let key = e.which;
    if (key === 13) {
        $(document.activeElement).blur();
        $(".new-account.add").trigger("click");
    }
});

function getAccountInfo(next) {
    getRequest(location.pathname  + "/list", function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            let accountInfo = JSON.parse(xmlHttpRequest.responseText);
            if (next) next(accountInfo);
        } else {
            if (next) next();
        }
    })
}

function displayAccountInfo(accountInfo) {
    if (!accountInfo) return showSnackbar(basicSnackbar, locale.cant_retrieve_accounts);
    let table = $("#accounts").find("tbody");
    let tableRows = $("#accounts").find("tr:not(.first-row)");
    tableRows.remove();
    let currentInfo;
    let adminID;
    if (!deletedMode) {
        currentInfo = accountInfo[currentID];
        table.append(getAccountRowHTML(currentInfo.id, currentInfo.username, currentInfo.privilege, currentInfo.enabled));
    }
    for (let id in accountInfo) {
        if (!accountInfo.hasOwnProperty(id)) continue;
        let info = accountInfo[id];
        if (!deletedMode && info.username === "admin") adminID = id;
        if (!deletedMode && id === currentInfo.id) continue;
        table.append(getAccountRowHTML(info.id, info.username, info.privilege, info.enabled));
    }
    if (!deletedMode) {
        $(`.account.username[name=${adminID}]`).prop("disabled", true);
        $(`.account.enabled[name=${adminID}]`).prop("disabled", true);
        $(`.account.delete[name=${adminID}]`).prop("disabled", true);
        $(`.account.privilege[name=${currentID}]`).prop("disabled", true);
        $(`.account.enabled[name=${currentID}]`).prop("disabled", true);
        if (currentInfo.privilege > 0 || currentInfo.username.toLowerCase() === "admin") {
            table.append(getNewAccountRowHTML());
        }
    }

    accountFieldValues = accountInfo;
    $(".account.username, .account.privilege").blur(updateField);
    $(".account.password").blur(updateField)
    $(".account.enabled").click(updateCheckbox);
    $(".account.delete, .new-account.add").click(updateButton);
}

function getAccountRowHTML(id, username, privilege, enabled) {
    if (privilege === 100) privilege = "ADMIN";
    enabled = (enabled === 1) ? "checked" : "";
    let html = `<tr name=${id}>` +
        `<td><input class='username account first-column' name=${id} ${deletedMode ? "disabled" : ""} type='text' autocomplete='off' autocapitalize='none' value='${username}' placeholder='${locale.new_username}'></td>` +
        `<td><input class='password account' name=${id} ${deletedMode ? "disabled" : ""} type='password' placeholder='••••••••••••••••••••••••' onfocus='this.placeholder = ""' onblur='this.placeholder = "••••••••••••••••••••••••"'></td>` +
        `<td><input class='privilege account' name=${id} ${deletedMode ? "disabled" : ""} type='text' maxlength='5' autocomplete='off' autocapitalize='none' value='${privilege}' placeholder='${locale.new_password}'></td>` +
        `<td><div class='mdc-checkbox'><input type='checkbox' ${deletedMode ? "disabled" : ""} ${enabled} class='enabled account mdc-checkbox__native-control' name=${id}><div class='mdc-checkbox__background'><svg class='mdc-checkbox__checkmark' viewBox='0 0 24 24'><path class='mdc-checkbox__checkmark-path' fill='none' d='M1.73,12.91 8.1,19.28 22.79,4.59'/></svg><div class='mdc-checkbox__mixedmark'></div></div></div></td>`;


    html += `<td><button class='delete account mdc-icon-button material-icons' name=${id}>delete</button></td>` +
               `</tr>`;
    return html;
}

function getNewAccountRowHTML() {
    return `<tr name=-1>` +
           `<td><input class='username new-account first-column' name=-1 type='text' autocomplete='off' autocapitalize='none' placeholder='${locale.new_account_username}'></td>` +
           `<td><input class='password new-account' name=-1 type='password' placeholder='${locale.new_account_password}'></td>` +
           `<td><input class='privilege new-account' name=-1 type='text' maxlength='5' autocomplete='off' autocapitalize='none' placeholder='${locale.new_account_privilege}'></td>` +
           `<td><button class='add new-account mdc-icon-button material-icons' name=-1>add</button></td>` +
           `<td></td>` +
           `</tr>`;
}

function updateCallback(xmlHttpRequest) {
    if (xmlHttpRequest.status === 0) {
        showDialog(okDialog, locale.app_name, locale.session_expired, {
            "close": function () {
                location.reload()
            }
        });
    } else if (xmlHttpRequest.status !== 200) {
        showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
        getAccountInfo(displayAccountInfo);
    }
}

function updateValidation(id, field, fieldName, newValue) {
    switch (fieldName) {
        case "username":
            newValue = newValue.trim();
            break;
        case "password":
            if (newValue.trim() === "") return false;
            field.val("");
            break;
        case "privilege":
            newValue = newValue.trim();
            if (newValue >= 100 || newValue.toUpperCase() === "ADMIN") newValue = 100;
            newValue = parseInt(newValue);
            if (isNaN(newValue) || newValue < 0) {
                showSnackbar(basicSnackbar, locale.invalid_privilege);
                return false;
            }
            if (newValue >= 100) field.val("ADMIN");
            else field.val(newValue);
            break;
    }
    let oldValue = accountFieldValues[id][fieldName];
    if (oldValue !== newValue) {
        accountFieldValues[id][fieldName] = newValue;
        return newValue;
    } else return false;
}

function updateField(event, data) {
    let field = $(event.target);
    let value = field.val();
    let id = field.attr("name");
    if (!data) data = {};
    data["id"] = id;
    let url = location.pathname + "/";
    let fieldName;
    if (field.hasClass("username")) fieldName = "username";
    if (field.hasClass("password")) fieldName = "password";
    if (field.hasClass("privilege")) fieldName = "privilege";
    value = updateValidation(id, field, fieldName, value);
    if (value !== false) {
        data[fieldName] = value;
        patchRequest(url + fieldName, JSON.stringify(data), updateCallback)
    } else {
        let oldValue = accountFieldValues[id][fieldName];
        if (fieldName === "privilege" && oldValue === 100) oldValue = "ADMIN";
        field.val(oldValue);
    }
}

function showPromptPassword(event) {
    let field = $(event.target);
    if (field.val().trim() === "") return;
    let id = field.attr("name");
    let username = accountFieldValues[id].username;
    let dialogBody = `<div class='mdc-text-field'><input class='mdc-text-field__input' id='current-password' type='password' tabindex='1'><div class='mdc-line-ripple'></div><label class='mdc-floating-label'>Password</label></div>`;
    passwordDialog = showDialog(okDialog, "Confirm current password for " + username, dialogBody);
    let textFields = document.getElementsByClassName('mdc-text-field');
    for (let i = 0; i < textFields.length; i++) {
        new mdc.textField.MDCTextField(textFields[i]);
    }
    let doneButton = $(".mdc-dialog__actions").find("button");
    doneButton.find("span").text("DONE");

    passwordDialog.listen("MDCDialog:closing", function() {
        let currentPassword = $("#current-password");
        let password = currentPassword.val();
        if (field.hasClass("password")) updateField(event, {"old_password": password});
    })
}

function updateCheckbox(event, data) {
    let checkbox = $(event.target);
    let checked = checkbox.prop("checked");
    let id = checkbox.attr("name");
    if (!data) data = {};
    data["id"] = id;
    let url = location.pathname + "/";
    let checkboxName;
    if (checkbox.hasClass("enabled")) checkboxName = "enabled";
    data[checkboxName] = checked;
    accountFieldValues[id][checkboxName] = checked ? 1 : 0;
    patchRequest(url + checkboxName, JSON.stringify(data), updateCallback)
}

function updateButton(event) {
    let button = $(event.target);
    let id = button.attr("name");
    let data = {"id": id};
    let url = location.pathname + "/";

    if (button.hasClass("delete")) {
        let prompt = locale.confirm_delete.replace("{0}", accountFieldValues[id].username);
        if (!deletedMode && id === currentID) prompt = locale.confirm_delete_account;
        showDialog(yesNoDialog, locale.app_name, prompt, {
            "yes": function () {
                deleteRequest(url + "delete", JSON.stringify(data), updateCallback);
                if (!deletedMode && id === currentID) {
                    window.location = "/logout";
                } else {
                    delete accountFieldValues[id];
                    $("#accounts").find(`tr[name=${id}]`).remove();
                }
            }
        });
    }
    if (button.hasClass("add")) {
        let username = $(".new-account.username").val().trim();
        let password = $(".new-account.password").val();
        let privilege = $(".new-account.privilege").val().trim();
        if (username === "" || password.trim() === "") return;
        if (privilege === "") privilege = undefined;
        if (privilege && privilege.toUpperCase() !== "ADMIN") {
            privilege = parseInt(privilege);
            if (isNaN(privilege) || privilege < 0) {
                showSnackbar(basicSnackbar, locale.invalid_privilege);
                return;
            }
        }
        data["username"] = username;
        data["password"] = password;
        if (privilege) data["privilege"] = privilege;
        putRequest(url + "new", JSON.stringify(data), function(xmlHttpRequest) {
            if (xmlHttpRequest.status === 0) {
                showDialog(okDialog, locale.app_name, locale.session_expired, {
                    "close": function () {
                        location.reload()
                    }
                });
            } else {
                if (xmlHttpRequest.status !== 200) {
                    showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
                }
                getAccountInfo(displayAccountInfo);
            }
        });
    }
}