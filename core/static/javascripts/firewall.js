let firewallFieldValues;

$(document).ready(function() {
    getFirewallInfo(displayFirewallInfo);
});

$(document).keypress(function(e) {
    let key = e.which;
    if (key === 13) {
        $(document.activeElement).blur();
        $(".new-firewall.add").trigger("click");
    }
});

function getFirewallInfo(next) {
    getRequest(location.pathname  + "/list", function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            let firewallInfo = JSON.parse(xmlHttpRequest.responseText);
            if (next) next(firewallInfo);
        } else {
            if (next) next();
        }
    })
}

function displayFirewallInfo(firewallInfo) {
    if (!firewallInfo) return showSnackbar(basicSnackbar, locale.cant_retrieve_firewall);
    let table = $("#firewall").find("tbody");
    let tableRows = $("#firewall").find("tr:not(.first-row)");
    tableRows.remove();

    for (let ip in firewallInfo) {
        if (!firewallInfo.hasOwnProperty(ip)) continue;
        let info = firewallInfo[ip];
        //Hide expired entries (must implement data validation for end date so that end date > Date.now())
        //if (info.end !== null && info.end <= Date.now()) continue;
        table.append(getFirewallRowHTML(info.ip, info.start, info.end));
    }
    
    table.append(getNewFirewallRowHTML());

    firewallFieldValues = firewallInfo;
    $(".firewall.ip, .firewall.start, .firewall.end").blur(updateField);
    $(".firewall.delete, .new-firewall.add").click(updateButton);
}

function getFirewallRowHTML(ip, start, end) {
    let html = `<tr name=${ip}>` +
                `<td><input class='ip firewall first-column' name=${ip} type='text' autocomplete='off' autocapitalize='none' value='${ip}' placeholder='${locale.new_ip}'></td>` +
                `<td><input class='start firewall' name=${ip} type='number' autocomplete='off' autocapitalize='none' value='${start}' placeholder='${locale.no_start_date}'></td>` +
                `<td><input class='end firewall' name=${ip} type='number' autocomplete='off' autocapitalize='none' value='${end}' placeholder='${locale.no_end_date}'></td>` +
                `<td><button class='delete firewall mdc-icon-button material-icons' name=${ip}>delete</button></td>` +
                `</tr>`;
    return html;
}

function getNewFirewallRowHTML() {
    return `<tr name=-1>` +
        `<td><input class='ip new-firewall first-column' name=-1 type='text' autocomplete='off' autocapitalize='none' placeholder='${locale.ip_address}'></td>` +
        `<td><input class='start new-firewall' name=-1 type='number' autocomplete='off' autocapitalize='none' placeholder='${locale.start_date}'></td>` +
        `<td><input class='length new-firewall' name=-1 type='number' autocomplete='off' autocapitalize='none' placeholder='${locale.length}'></td>` +
        `<td><button class='add new-firewall mdc-icon-button material-icons' name=-1>add</button></td>` +
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
        getFirewallInfo(displayFirewallInfo);
    }
}

function updateValidation(ip, field, fieldName, newValue) {
    switch (fieldName) {
        case "ip":
            newValue = newValue.trim();
            break;
        case "start":
            newValue = newValue.trim();
            if (newValue === "") newValue = null;
            break;
        case "end":
            newValue = newValue.trim();
            if (newValue === "") newValue = null;
            break;
    }
    let oldValue = firewallFieldValues[ip][fieldName];
    if (oldValue !== newValue) {
        firewallFieldValues[ip][fieldName] = newValue;
        return newValue;
    } else return false;
}

function updateField(event, data) {
    let field = $(event.target);
    let value = field.val();
    let ip = field.attr("name");
    if (!data) data = {};
    data["ip"] = ip;
    data["list"] = list;
    let url = location.pathname + "/" + ".." + "/";
    let fieldName;
    if (field.hasClass("ip")) fieldName = "ip";
    if (field.hasClass("start")) fieldName = "start";
    if (field.hasClass("end")) fieldName = "end";
    value = updateValidation(ip, field, fieldName, value);
    if (value !== false) {
        data["new_" + fieldName] = value;
        patchRequest(url + fieldName, JSON.stringify(data), updateCallback)
    } else {
        let oldValue = firewallFieldValues[ip][fieldName];
        field.val(oldValue);
    }
}

function updateButton(event) {
    let button = $(event.target);
    let ip = button.attr("name");
    let data = {"ip": ip, "list": list};
    let url = location.pathname + "/" + ".." + "/";

    if (button.hasClass("delete")) {
        const prompt = locale.confirm_delete.replace("{0}", ip);
        showDialog(yesNoDialog, locale.app_name, prompt, {
            "yes": function () {
                deleteRequest(url + "delete", JSON.stringify(data), updateCallback);
                delete firewallFieldValues[ip];
                $("#firewall").find(`tr[name="${ip}"]`).remove();
            }
        });
    }
    if (button.hasClass("add")) {
        let ip = $(".new-firewall.ip").val().trim();
        let start = $(".new-firewall.start").val().trim();
        let length = $(".new-firewall.length").val().trim();

        if (ip === "") return;
        if (start === "") start = Date.now();
        if (length === "") length = null;

        //data validation goes here

        data["ip"] = ip;
        data["start"] = start;
        data["length"] = length;

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
                getFirewallInfo(displayFirewallInfo);
            }
        });
    }
}