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
            let dialogBody = "<input readonly autofocus=false class='sharing-p selectable' id='link' value='" + window.location.protocol + "//" + window.location.host + link + "'>" +
                "<br>" +
                "<table id='accounts-table'>" +
                "<tr class='sharing-tr'><td><p class='sharing-p'>Account</p></td><td><p class='sharing-p'>Expiration</p></td><td><p class='sharing-p' style='margin-left: 17px'>Access</p></td><td></td></tr>" +
                "<tr class='sharing-tr'><td><input readonly type='text' class='sharing_username' name='-1' value='Public'></td><td><input type='text' class='sharing_expiration' name='-1' placeholder='New expiration' value='None'></td><td><div class=\"sharing_access mdc-select mdc-select--outlined\"><input type=\"hidden\" name=\"enhanced-select\"><i class=\"mdc-select__dropdown-icon\"></i><div class=\"mdc-select__selected-text\"></div><div class=\"mdc-select__menu mdc-menu mdc-menu-surface\"><ul class=\"mdc-list\"><li class=\"mdc-list-item\">No access</li> <li class=\"mdc-list-item\">Read access</li> <li class=\"mdc-list-item\">Read & write access</li></ul></div><div class=\"mdc-line-ripple\"></div></div></td><td><button class=\"sharing_delete mdc-icon-button material-icons\" name='-1'>delete</button></td></tr>";


            for (let sharingIndex in sharing) {
                if (sharing.hasOwnProperty(sharingIndex)) {
                    let account = sharing[sharingIndex];
                    if (account.expiration === null) account.expiration = "None";
                    if (account.id !== -1) {
                        dialogBody += "<tr class='sharing-tr'><td><input readonly type='text' class='sharing_username' name='" + account.id + "' value='" + account.username + "' placeholder='New username' autocomplete='off' autocapitalize='none'></td><td><input type='text' class='sharing_expiration' name='" + account.id + "' value='" + account.expiration + "' placeholder='New expiration'></td><td><div class=\"sharing_access mdc-select mdc-select--outlined\"><input type=\"hidden\" name=\"enhanced-select\"><i class=\"mdc-select__dropdown-icon\"></i><div class=\"mdc-select__selected-text\"></div><div class=\"mdc-select__menu mdc-menu mdc-menu-surface\"><ul class=\"mdc-list\"><li class=\"mdc-list-item\">Same as public</li> <li class=\"mdc-list-item\">Read access</li> <li class=\"mdc-list-item\">Read & write access</li></ul></div><div class=\"mdc-line-ripple\"></div></div></td><td><button class=\"sharing_delete mdc-icon-button material-icons\" name='" + account.id + "'>delete</button></td></tr>"
                    }
                }
            }

            dialogBody += "<tr class='sharing-tr'><td><input type='text' class='sharing_username' name='new' placeholder='Share with...' autocomplete='off' autocapitalize='none'></td><td><input type='text' class='sharing_expiration' name='new' value='None' placeholder='New expiration'></td><td><div class=\"sharing_access mdc-select mdc-select--outlined\" name = 'new'><input type=\"hidden\" name=\"enhanced-select\"><i class=\"mdc-select__dropdown-icon\"></i><div class=\"mdc-select__selected-text\"></div><div class=\"mdc-select__menu mdc-menu mdc-menu-surface\"><ul class=\"mdc-list\"><li class=\"mdc-list-item\">Same as public</li><li class=\"mdc-list-item\">Read access</li> <li class=\"mdc-list-item\">Read & write access</li></ul></div><div class=\"mdc-line-ripple\"></div></div></td><td><button class=\"sharing_add mdc-icon-button material-icons\" name='new'>add</button></td></tr>";

            dialogBody += "</table>";


            let shareDialog = showDialog(okDialog, "Share " + event.data.filePath.split("/").pop(), dialogBody);

            let count = 0;
            let newShare = $(".sharing_username[name='new']");
            $(".sharing-tr").last().append("<div class=\"mdc-card mdc-elevation--z10\" id=\"search\" style=\"overflow: scroll; z-index:20;position:absolute; left: 23px; top: 313px; max-height: 200px; padding-bottom: 8px; padding-top: 2px\"><ul id='search-list' class='mdc-list'></ul></div>");
            let searchList = $("#search-list");
            newShare.keyup(function() {
                let newShareValue = newShare.val();
                if (newShareValue.trim() === "") {
                    searchList.empty();
                } else if (count % 3 === 0 || newShareValue.length === 1) {
                    getRequest("/accounts/search?q=" + newShareValue, function(xmlHttpRequest) {
                        if (xmlHttpRequest.status === 200) {
                            searchList.empty();
                            var accountsList = JSON.parse(xmlHttpRequest.responseText.trim());
                            for (var account in accountsList) {
                                if (accountsList.hasOwnProperty(account)) {
                                    let id = accountsList[account].id;
                                    let username = accountsList[account].username;
                                    searchList.append("<li class='mdc-list-item search-result' name='" + id +  "'>" + username + "</li>");
                                }

                            }
                            $(".search-result").click(function() {
                                let id = $(this).attr("name");
                                let username = $(this).html();
                                searchList.empty();
                                newShare.val(username);
                            });
                        }
                    });
                }
                count++;
            });

            $("#link").click(function() {
                $("#link").select();
                document.execCommand('copy');
                showSnackbar(basicSnackbar, "Copied link to clipboard")
            });

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
                    selectMenu.selectedIndex = 1;
                } else {
                    selectMenu.selectedIndex = sharing[i].access;
                }

            }

            $(".sharing_add").click(function() {

                let username = newShare.val();
                let access = newShareMenu.selectedIndex;

                setAccessUsername({"data": event.data, "detail": {"username": username, "index": access}})
            });

            $(".sharing_delete").click(function() {
                let id = $(this).attr("name");
                removeAccess({"data": event.data, "detail": {"id": id}});
            });

            let iconButtons = document.getElementsByClassName('mdc-icon-button');
            for (let i = 0; i < iconButtons.length; i++) {
                new mdc.ripple.MDCRipple(iconButtons[i]).unbounded = true;
            }

            $(".mdc-dialog__actions").find("button").find("span").text("DONE");
            $(".mdc-dialog__actions").prepend("<button id='password-button' class='mdc-button mdc-button'> <span class=\"mdc-button__label\"></span></button><button id='enable-sharing' class='mdc-button mdc-button'> <span class=\"mdc-button__label\"></span></button>");
            $("#password-button").click(function () {
                if ($(this).first().html() === "Set Public Password") {
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
                                $("#password-button").first().html("Remove Public Password");
                            } else {
                                $("#password-button").first().html("Set Public Password");
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
                    $("#password-button").first().html("Remove Public Password");
                } else {
                    $("#password-button").first().html("Set Public Password");
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
    postRequest(event.data.filePath + "?sharing", "action=addAccess&access=" + accessIndex + "&id=" + id, function(xmlHttpRequest) {
        if (xmlHttpRequest.status !== 200) {
            showSnackbar(basicSnackbar, "Couldn't change access");
        }
    })
};

var setAccessUsername = function(event) {
    let accessIndex = event.detail.index;
    let username = event.detail.username;
    if (username === undefined) return;
    postRequest(event.data.filePath + "?sharing", "action=addAccess&access=" + accessIndex + "&username=" + username, function(xmlHttpRequest) {
        if (xmlHttpRequest.status !== 200) {
            showSnackbar(basicSnackbar, "Couldn't change access");
        }
    })
};

var removeAccess = function(event) {
    let id = (event.detail.id !== undefined) ? event.detail.id : -1;
    postRequest(event.data.filePath + "?sharing", "action=removeAccess&id=" + id, function(xmlHttpRequest) {
        if (xmlHttpRequest.status !== 200) {
            showSnackbar(basicSnackbar, "Couldn't remove access");
        }
    })
};

var showSetPassword = function(event) {
    let dialogBody = "<div class='mdc-text-field'><input class='mdc-text-field__input' id='new-password' type='password' tabindex='1'/><div class=\"mdc-line-ripple\"></div><label class=\"mdc-floating-label\">Password</label></div>";
    let setPasswordDialog = showDialog(okDialog, "Set password for " + event.data.filePath.split("/").pop(), dialogBody);
    let textFields = document.getElementsByClassName('mdc-text-field');
    for (let i = 0; i < textFields.length; i++) {
        new mdc.textField.MDCTextField(textFields[i]);
    }
    $(".mdc-dialog__actions").find("button").find("span").text("DONE");
    $(".mdc-dialog__actions").find("button").click(function() {
        event.detail = {};
        event.detail.password = $("#new-password").val();
        setPassword(event);
    })

};

var setPassword = function(event) {
    let password = event.detail.password;
    postRequest(event.data.filePath + "?sharing", "action=setPassword&password=" + password, function(xmlHttpRequest) {
        if (xmlHttpRequest.status !== 200) {
            showSnackbar(basicSnackbar, "Couldn't set password");
        }
    })
};

var removePassword = function(event) {
    postRequest(event.data.filePath + "?sharing", "action=deletePassword", function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            $("#password-button").first().html("Set Public Password");
        } else {
            showSnackbar(basicSnackbar, "Couldn't remove password");
        }
    })
};