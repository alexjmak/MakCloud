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
            let dialogBody = "<p class='sharing-p, selectable' id='link' >" + window.location.protocol + "//" + window.location.host + link + "</p>" +
                "<br>" +
                "<table id='accounts-table'>" +
                "<tr class='sharing-tr'><td><p class='sharing-p'>Account</p></td><td><p class='sharing-p'>Expiration</p></td><td>Access</td><td></td></tr>" +
                "<tr class='sharing-tr'><td><input readonly type='text' class='sharing_username' name='-1' value='Public'></td><td><input type='text' class='sharing_expiration' name='-1' placeholder='New expiration' value='None'></td><td><div class=\"sharing_access mdc-select mdc-select--outlined\"><input type=\"hidden\" name=\"enhanced-select\"><i class=\"mdc-select__dropdown-icon\"></i><div class=\"mdc-select__selected-text\"></div><div class=\"mdc-select__menu mdc-menu mdc-menu-surface\"><ul class=\"mdc-list\"><li class=\"mdc-list-item\">No access</li> <li class=\"mdc-list-item\">Read access</li> <li class=\"mdc-list-item\">Read & write access</li></ul></div><div class=\"mdc-line-ripple\"></div></div></td><td><button class=\"sharing_delete mdc-icon-button material-icons\" name='-1'>delete</button></td></tr>";


            for (let sharingIndex in sharing) {
                if (sharing.hasOwnProperty(sharingIndex)) {
                    let account = sharing[sharingIndex];
                    if (account.expiration === null) account.expiration = "None";
                    if (account.id !== -1) {
                        dialogBody += "<tr class='sharing-tr, account-row'><td><input type='text' class='sharing_username' name='" + account.id + "' value='" + account.username + "' placeholder='New username' autocomplete='off' autocapitalize='none'></td><td><input type='text' class='sharing_expiration' name='" + account.id + "' value='" + account.expiration + "' placeholder='New expiration'></td><td><div class=\"sharing_access mdc-select mdc-select--outlined\"><input type=\"hidden\" name=\"enhanced-select\"><i class=\"mdc-select__dropdown-icon\"></i><div class=\"mdc-select__selected-text\"></div><div class=\"mdc-select__menu mdc-menu mdc-menu-surface\"><ul class=\"mdc-list\"><li class=\"mdc-list-item\">No access</li> <li class=\"mdc-list-item\">Read access</li> <li class=\"mdc-list-item\">Read & write access</li></ul></div><div class=\"mdc-line-ripple\"></div></div></td><td><button class=\"sharing_delete mdc-icon-button material-icons\" name='" + account.id + "'>delete</button></td></tr>"
                    }
                }
            }

            dialogBody += "<tr class='sharing-tr'><td><input type='text' class='sharing_username' name='new' placeholder='Share with...'></td><td><input type='text' class='sharing_expiration' name='new' value='None' placeholder='New expiration'></td><td><div class=\"sharing_access mdc-select mdc-select--outlined\"><input type=\"hidden\" name=\"enhanced-select\"><i class=\"mdc-select__dropdown-icon\"></i><div class=\"mdc-select__selected-text\"></div><div class=\"mdc-select__menu mdc-menu mdc-menu-surface\"><ul class=\"mdc-list\"><li class=\"mdc-list-item\">Read access</li> <li class=\"mdc-list-item\">Read & write access</li></ul></div><div class=\"mdc-line-ripple\"></div></div></td><td><button class=\"sharing_add mdc-icon-button material-icons\" name='new'>add</button></td></tr>"

            dialogBody += "</table>";

            let shareDialog = showDialog(okDialog, "Share " + event.data.filePath.split("/").pop(), dialogBody);

            let publicMenu;
            let newShareMenu;

            let selectMenus = document.getElementsByClassName('mdc-select');
            for (let i = 0; i < selectMenus.length; i++) {
                let selectMenu = new mdc.select.MDCSelect(selectMenus[i]);
                if (i === 0) publicMenu = selectMenu;
                if (i === selectMenus.length - 1) newShareMenu = selectMenu;
                selectMenu.listen('MDCSelect:change', function(selectEvent) {
                    if (i !== selectMenus.length - 1) {
                        selectEvent.data = {};
                        selectEvent.detail.id = sharing[i].id;
                        selectEvent.data.filePath = event.data.filePath;
                        setAccess(selectEvent)
                    }

                });
                if (i === selectMenus.length - 1) {
                    selectMenu.selectedIndex = 0;
                } else {
                    selectMenu.selectedIndex = sharing[i].access;
                }

            }

            let iconButtons = document.getElementsByClassName('mdc-icon-button');
            for (let i = 0; i < iconButtons.length; i++) {
                new mdc.ripple.MDCRipple(iconButtons[i]).unbounded = true;
            }

            $(".mdc-dialog__actions").find("button").find("span").text("DONE");
            $(".mdc-dialog__actions").prepend("<button id='password-button' class='mdc-button mdc-button'> <span class=\"mdc-button__label\"></span></button><button id='enable-sharing' class='mdc-button mdc-button'> <span class=\"mdc-button__label\"></span></button>");
            $("#password-button").click(function () {
                if ($(this).first().html() === "Set Password") {
                    shareDialog.listen('MDCDialog:closed', function() {
                        $("#dialog").remove();
                        showSetPassword(event);
                    });
                    shareDialog.close();

                } else {
                    removePassword(event);
                }
            });
            $("#enable-sharing").click(function() {
                if ($(this).first().html() === "Enable Sharing") {
                    $(this).prop("disabled", true);
                    postRequest(event.data.filePath + "?sharing", "action=create", function(xmlHttpRequest) {
                        if (xmlHttpRequest.status === 201) {
                            $("#enable-sharing").removeAttr("disabled");
                            $("#enable-sharing").first().html("Disable Sharing");
                            if (passwordEnabled) {
                                $("#password-button").first().html("Remove Password");
                            } else {
                                $("#password-button").first().html("Set Password");
                            }
                            $("#password-button").show();
                            $(".account-row").remove();
                            publicMenu.selectedIndex = 0;
                            newShareMenu.selectedIndex = 0;
                            $("#link").first().first().text(window.location.protocol + "//" + window.location.host + xmlHttpRequest.responseText);
                            $("#link").show();
                            $("#accounts-table").show();
                        } else {
                            $("#dialog-content").html("<p class='sharing-p'>Sharing is currently unavailable.</p>")
                        }
                    });

                } else {
                    $(this).prop("disabled", true);
                    postRequest(event.data.filePath + "?sharing", "action=delete", function(xmlHttpRequest) {
                        if (xmlHttpRequest.status === 200) {
                            $("#enable-sharing").removeAttr("disabled");
                            $("#enable-sharing").first().html("Enable Sharing");
                            $("#password-button").hide();
                            $("#link").hide();
                            $("#accounts-table").hide();
                        } else {
                            $("#dialog-content").html("<p class='sharing-p'>Sharing is currently unavailable.</p>")
                        }
                    });
                }
            });

            if (link === null) {
                $("#enable-sharing").first().html("Enable Sharing");
                $("#password-button").hide();
                $("#link").hide();
                $("#accounts-table").hide();
            } else {
                $("#enable-sharing").first().html("Disable Sharing");
                if (passwordEnabled) {
                    $("#password-button").first().html("Remove Password");
                } else {
                    $("#password-button").first().html("Set Password");
                }
                $("#password-button").show();
            }

        } else {
            showDialog(okDialog, "Share " + event.data.filePath.split("/").pop(), "Sharing unavailable right now.");

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

var setAccess = function(event) {
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

var showSetPassword = function(event) {
    let dialogBody = "<div class='mdc-text-field'><input class='mdc-text-field__input' id='password' type='password' tabindex='1'/><div class=\"mdc-line-ripple\"></div><label class=\"mdc-floating-label\">Password</label></div>";
    let setPasswordDialog = showDialog(okDialog, "Set password for " + event.data.filePath.split("/").pop(), dialogBody);
    let textFields = document.getElementsByClassName('mdc-text-field');
    for (let i = 0; i < textFields.length; i++) {
        new mdc.textField.MDCTextField(textFields[i]);
    }
    $(".mdc-dialog__actions").find("button").find("span").text("DONE");
    $(".mdc-dialog__actions").find("button").click(function() {
        event.detail = {};
        event.detail.password = $("#password").val();
        setPassword(event);
    })

};

var setPassword = function(event) {
    let password = event.detail.password;
    postRequest(event.data.filePath + "?sharing", "action=setPassword&password=" + password, function(xmlHttpRequest) {
        if (xmlHttpRequest.status !== 200) {
            console.log(xmlHttpRequest.status)
        }
    })
};

var removePassword = function(event) {
    postRequest(event.data.filePath + "?sharing", "action=deletePassword", function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            $("#password-button").first().html("Set Password");
        } else {
            console.log(xmlHttpRequest.status)
        }
    })
};