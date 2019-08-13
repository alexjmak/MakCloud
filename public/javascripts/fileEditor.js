let usedPasswordMemory;

var getFile = function(filePath, mode, authorization) {
    getRequest(filePath + "?" + mode, function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {

            if (mode === "authorize") {
                var supportedTypes = ["txt", "json", "log", "properties", "yml"];

                var fileEditor = $("#fileContents");
                if (supportedTypes.includes(filePath.split(".").pop())) {
                    getFile(filePath, "download");
                } else {
                    fileEditor.text("Can't open file type");
                    fileEditor.prop("contenteditable", false);
                    hideAuthorization();
                }
            }
            if (mode === "download") {
                $("#fileContents").text(xmlHttpRequest.responseText);
                hideAuthorization();
            }

        } else if (xmlHttpRequest.status === 401) {
            showAuthorization();
            if (authorization !== undefined) {
                $("#message").text(xmlHttpRequest.responseText);
            }
        } else if (xmlHttpRequest.status === 0) {
            $("#message").text("No connection");
            usedPasswordMemory = "";
        }
    }, authorization);
};

var save = function(event) {
    var filePath = event.data.filePath;
    var newFileContents = $("#fileContents").text();
    var data = "newFileContents=" + encodeURIComponent(newFileContents);

    postRequest(filePath, data, function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
        }
    });
};

var revert = function(event) {
    $("#fileContents").text(event.data.initialFileContents);
};

var download = function(event) {
    if ($("#fileContents").is(":hidden")) return;
    window.open(event.data.filePath + "?download", "_blank");
};

var setAccess = function(event) {
    console.log(event);
    let accessIndex = event.detail.index;
    let id = (event.detail.id !== undefined) ? event.detail.id : -1;
    postRequest(event.data.filePath + "?sharing", "action=update&access=" + accessIndex + "&id=" + id, function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            console.log(200);
        } else {
            console.log(xmlHttpRequest.status)
        }
    })

};
var share = function(event) {
    if ($("#fileContents").is(":hidden")) return;
    getRequest(event.data.filePath + "?sharing", function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            let sharingInfo = JSON.parse(xmlHttpRequest.responseText);
            let link = (sharingInfo !== null) ? sharingInfo.link : null;
            let passwordEnabled = (sharingInfo !== null) ? sharingInfo.passwordEnabled : null;
            let sharing = (sharingInfo !== null) ? sharingInfo.sharing : null;

            if (sharing === null || sharing.length === 0) {
                sharing = [{"id": -1, "access": 0}];
            }
            let dialogBody = "<p id='link'>" + window.location.protocol + "//" + window.location.host + link + "</p>" +
                "<br>" +
                "<table id='accounts-table'>" +
                "<tr><td><p>Account</p></td><td><p>Expiration</p></td><td>Access</td><td></td></tr>" +
                "<tr><td><input readonly type='text' class='sharing_username' name='-1' value='Public'></td><td><input type='text' class='sharing_expiration' name='-1' placeholder='New expiration' value='None'></td><td><div class=\"sharing_access mdc-select mdc-select--outlined\"><input type=\"hidden\" name=\"enhanced-select\"><i class=\"mdc-select__dropdown-icon\"></i><div class=\"mdc-select__selected-text\"></div><div class=\"mdc-select__menu mdc-menu mdc-menu-surface\"><ul class=\"mdc-list\"><li class=\"mdc-list-item\">No access</li> <li class=\"mdc-list-item\">Read access</li> <li class=\"mdc-list-item\">Read & write access</li></ul></div><div class=\"mdc-line-ripple\"></div></div></td><td><button class=\"sharing_delete mdc-icon-button material-icons\" name='-1'>delete</button></td></tr>";


            for (let sharingIndex in sharing) {
                if (sharing.hasOwnProperty(sharingIndex)) {
                    let account = sharing[sharingIndex];
                    if (account.expiration === null) account.expiration = "None";
                    if (account.id !== -1) {
                        dialogBody += "<tr class='account-row'><td><input type='text' class='sharing_username' name='" + account.id + "' value='" + account.username + "' placeholder='New username' autocomplete='off' autocapitalize='none'></td><td><input type='text' class='sharing_expiration' name='" + account.id + "' value='" + account.expiration + "' placeholder='New expiration'></td><td><div class=\"sharing_access mdc-select mdc-select--outlined\"><input type=\"hidden\" name=\"enhanced-select\"><i class=\"mdc-select__dropdown-icon\"></i><div class=\"mdc-select__selected-text\"></div><div class=\"mdc-select__menu mdc-menu mdc-menu-surface\"><ul class=\"mdc-list\"><li class=\"mdc-list-item\">No access</li> <li class=\"mdc-list-item\">Read access</li> <li class=\"mdc-list-item\">Read & write access</li></ul></div><div class=\"mdc-line-ripple\"></div></div></td><td><button class=\"sharing_delete mdc-icon-button material-icons\" name='" + account.id + "'>delete</button></td></tr>"
                    }
                }
            }

            dialogBody = dialogBody.replace("*public_expiration*", "None");

            dialogBody += "<tr><td><input type='text' class='sharing_username' name='new' placeholder='Share with...'></td><td><input type='text' class='sharing_expiration' name='new' value='None' placeholder='New expiration'></td><td><div class=\"sharing_access mdc-select mdc-select--outlined\"><input type=\"hidden\" name=\"enhanced-select\"><i class=\"mdc-select__dropdown-icon\"></i><div class=\"mdc-select__selected-text\"></div><div class=\"mdc-select__menu mdc-menu mdc-menu-surface\"><ul class=\"mdc-list\"><li class=\"mdc-list-item\">No access</li> <li class=\"mdc-list-item\">Read access</li> <li class=\"mdc-list-item\">Read & write access</li></ul></div><div class=\"mdc-line-ripple\"></div></div></td><td><button class=\"sharing_add mdc-icon-button material-icons\" name='new'>add</button></td></tr>"

            dialogBody += "</table>";

            showDialog(okDialog, "Share " + event.data.filePath, dialogBody);

            let selectMenus = document.getElementsByClassName('mdc-select');
            for (let i = 0; i < selectMenus.length; i++) {
                let selectMenu = new mdc.select.MDCSelect(selectMenus[i]);
                selectMenu.listen('MDCSelect:change', function(selectEvent) {
                    selectEvent.data = {};



                    if (sharing === null || sharing.length === 0) selectEvent.detail.id = -1;
                    else selectEvent.detail.id = sharing[i].id;
                    selectEvent.data.filePath = event.data.filePath;
                    setAccess(selectEvent)
                });
                if (sharing === null || sharing.length === 0) {
                    selectMenu.selectedIndex = 0;
                } else if (i === selectMenus.length - 1) {
                    selectMenu.selectedIndex = 1;
                } else {
                    selectMenu.selectedIndex = sharing[i].access;
                }

            }



            let iconButtons = document.getElementsByClassName('mdc-icon-button');
            for (let i = 0; i < iconButtons.length; i++) {
                new mdc.ripple.MDCRipple(iconButtons[i]).unbounded = true;
            }

            $(".mdc-dialog__actions").find("button").find("span").text("DONE");
            $(".mdc-dialog__actions").prepend("<button id='enable-sharing' class='mdc-button mdc-button'> <span class=\"mdc-button__label\"></span></button>");
            $("#enable-sharing").click(function() {
                if ($(this).first().html() === "Enable Sharing") {
                    $(this).prop("disabled", true);
                    postRequest(event.data.filePath + "?sharing", "action=create", function(xmlHttpRequest) {
                        if (xmlHttpRequest.status === 201) {
                            $("#enable-sharing").removeAttr("disabled");
                            $("#enable-sharing").first().html("Disable Sharing");
                            $(".account-row").remove();
                            $("#link").first().first().text(xmlHttpRequest.responseText);
                            $("#link").show();
                            $("#accounts-table").show();
                        } else {
                            $("#dialog-content").html("<p>Sharing is currently unavailable.</p>")
                        }
                    });

                } else {
                    $(this).prop("disabled", true);
                    postRequest(event.data.filePath + "?sharing", "action=delete", function(xmlHttpRequest) {
                        if (xmlHttpRequest.status === 200) {
                            $("#enable-sharing").removeAttr("disabled");
                            $("#enable-sharing").first().html("Enable Sharing");
                            $("#link").hide();
                            $("#accounts-table").hide();
                        } else {
                            $("#dialog-content").html("<p>Sharing is currently unavailable.</p>")
                        }
                    });


                }
            });

            if (link === null) {
                $("#enable-sharing").first().html("Enable Sharing");
                $("#link").hide();
                $("#accounts-table").hide();
            } else {
                $("#enable-sharing").first().html("Disable Sharing");
                $("#enable-sharing").attr("checked", true);
            }

        } else {
            showDialog(okDialog, "Share " + event.data.filePath, "Sharing unavailable right now.");

        }
    });
        /*
    postRequest(event.data.filePath + "?sharing", "link={\"action\": \"create\",  \"password\": \"password\"}", function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 201) {
            showDialog(okDialog, "Share " + event.data.filePath, location.protocol + '//' + location.hostname + xmlHttpRequest.responseText);
        } else {
            showDialog(okDialog, "Share " + event.data.filePath, "Link already created");
        }
    });
    */


};

var randomNumberArray = new Uint32Array(1);
window.crypto.getRandomValues(randomNumberArray);

var authorize = function(event) {
    let password = $("#password").val();
    if (password.trim() === "") {
        $("#message").text("Enter the password");
        return;
    }
    if ($.md5(password, randomNumberArray[0]) === usedPasswordMemory) return;
    usedPasswordMemory = $.md5(password, randomNumberArray[0]);
    password = btoa(":"+ password);
    getFile(event.data.filePath, "authorize", "Basic " + password)
};

var showAuthorization = function()  {
    $("#fileContents").hide();
    $("#authorization").show();
    $("#password").focus();
};

var hideAuthorization = function()  {
    $("#message").text("");
    $("#authorization").hide();
    $("#fileContents").show();
};

$(document).ready(function() {
    let pathSplit = filePath.split("/");
    if (pathSplit.length <= 1) {
        $("#back").hide();
    }

    filePath = pathSplit[pathSplit.length - 1];
    $(".mdc-drawer__title").text(filePath);


    getFile(filePath, "authorize");

    $("#back").click(function() {
        window.open(location.pathname + "/..", "_self");
    });
    
    $("#download").click({filePath: filePath}, download);

    $("#share").click({filePath: filePath}, share);

    $(document).keypress(function(e) {
        var key = e.which;
        if (key === 13) {
            authorize({data: {filePath: filePath}})
        }
    });

    $("#submit").click({filePath: filePath}, authorize);

    $("#logout").click(function() {
        $.removeCookie("fileToken", { path: location.pathname.split("/").slice(0, 4).join("/") });
        window.location.href = "/logout";
    });
});