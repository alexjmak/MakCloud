 $(document).ready(function() {
    var main = $("#main_accounts");
    var accounts = $("#accounts");
    var currentID = parseJwt($.cookie("loginToken")).aud;
    var currentPrivilege;
    var initialMD5 = null;
    var scrollHeight = null;
    var accounts_inputs;

    var inputStorage;


    var showNewAccount = function(accountID, accountUsername, accountPrivilege, enabled) {
        var checked;
        if (enabled) {
            checked = "checked";
        } else {
            checked = "";
        }

        accounts_inputs.append("<tr>" +
            "<td><input class=\"account_usernames first-column\" type=\"text\" autocomplete='off' autocapitalize=\"none\" name=\"" + accountID + "\" value=\"" + accountUsername + "\" placeholder='New username'></td>" +
            "<td><input class=\"account_passwords\" type=\"password\" name=\"" + accountID + "\" placeholder='••••••••••••••••••••••••' onfocus=\"this.placeholder = ''\" onblur=\"this.placeholder = '••••••••••••••••••••••••'\"></td>" +
            "<td><input class=\"account_privileges\" type=\"text\" maxlength=\"5\" autocomplete='off' autocapitalize=\"none\" name=\"" + accountID + "\" value='" + accountPrivilege + "' placeholder='New privilege'></td>" +
            "<td><div class=\"account_disable mdc-checkbox\" name=\"" + accountID + "\"> <input type=\"checkbox\" " + checked + " class=\"mdc-checkbox__native-control\"> <div class=\"mdc-checkbox__background\"> <svg class=\"mdc-checkbox__checkmark\" viewBox=\"0 0 24 24\"> <path class=\"mdc-checkbox__checkmark-path\" fill=\"none\" d=\"M1.73,12.91 8.1,19.28 22.79,4.59\"/> </svg> <div class=\"mdc-checkbox__mixedmark\"></div> </div> </div></td>" +
            "<td><button class=\"account_delete mdc-icon-button material-icons\" name=\"" + accountID + "\">delete</button> </td>" +
            "</tr>");
    };

    var getAccounts = function() {
        $("#accounts_inputs").remove();
        accounts.append("<tbody id=\"accounts_inputs\"></tbody>");
        accounts_inputs = $("#accounts_inputs");
        accounts_inputs.append("<tr><td><h4 class='first-column'>Username</h4></td><td><h4>Password</h4></td><td><h4>Privilege Level</h4></td><td><h4>Enabled</h4></td><td></td></tr><hr>");

        inputStorage = {};
        inputStorage["username"] = {};
        inputStorage["privilege"] = {};

        getRequest("/accounts/list", function(xmlHttpRequest) {
            if (xmlHttpRequest.status === 200) {
                if (xmlHttpRequest.responseURL.search("login") !== -1) {
                    window.location = "/logout";
                }

                var accountsList = JSON.parse(xmlHttpRequest.responseText.trim());

                var currentAccount = accountsList.filter(account => account.id === currentID)[0];
                currentPrivilege = currentAccount["privilege"];
                var currentUsername = currentAccount["username"];
                $("#currentUsername").text(currentUsername);


                showNewAccount(currentID, currentUsername, currentPrivilege, true);

                if (currentPrivilege === 100) {
                    $(".account_privileges[name=" + currentID + "]").val("ADMIN");
                }

                $(".account_privileges[name=" + currentID + "]").prop("disabled", true);
                $(".account_disable[name=" + currentID + "]").addClass("mdc-checkbox--disabled");
                $(".account_disable[name=" + currentID + "]").find('input').prop("disabled", true);

                for (var account in accountsList) {
                    account = accountsList[account];

                    var accountID = account["id"];
                    var accountUsername = account["username"];
                    var accountEnabled = account["enabled"] === 1;
                    var accountPrivilege = account["privilege"];
                    if (accountID !== currentID) {
                        if ((currentPrivilege > 0 && currentPrivilege > accountPrivilege  && accountUsername !== "admin") || currentUsername === "admin") {
                            showNewAccount(accountID, accountUsername, accountPrivilege, accountEnabled);
                            if (accountPrivilege === 100) {
                                $(".account_privileges[name=" + accountID + "]").val("ADMIN");
                            }
                            if (currentUsername !== "admin" && currentPrivilege === 1) {
                                $(".account_privileges[name=" + accountID + "]").prop("disabled", true);
                            }

                        }
                    }

                    if (account["username"] === "admin") {
                        $(".account_usernames[name=" + accountID + "]").prop("disabled", true);
                        $(".account_privileges[name=" + accountID + "]").prop("disabled", true);
                        $(".account_disable[name=" + accountID + "]").addClass("mdc-checkbox--disabled");
                        $(".account_disable[name=" + accountID + "]").find('input').prop("disabled", true);
                        $(".account_delete[name=" + accountID + "]").prop("disabled", true);
                    }

                    inputStorage["username"][accountID] = accountUsername;
                    inputStorage["privilege"][accountID] = accountPrivilege;
                }


                if (currentPrivilege > 0 || currentUsername === "admin") {
                    accounts_inputs.append(//"<tr><td>New account username</td><td>New account password</td><td></td><td></td></tr>" +
                        "</tr><tr><td><input id=\"new_account_username\" class='first-column' type=\"text\" autocomplete='off' autocapitalize=\"none\" placeholder='New account username'></td>" +
                        "<td><input id=\"new_account_password\" type=\"password\" placeholder='New account password'></td>" +
                        "<td><input id=\"new_account_privilege\" type=\"text\" maxlength=\"5\" autocomplete='off' autocapitalize=\"none\" placeholder='New account privilege'></td>" +
                        "<td><button class=\"mdc-icon-button material-icons\" id=\"new_account_submit\">add</button></td><td></td>" +
                        "</tr>");
                    if (currentUsername !== "admin" && currentPrivilege === 1) {
                        $("#new_account_privilege").val("0");
                        $("#new_account_privilege").prop("disabled", true);
                    }
                }

                let iconButtons = document.getElementsByClassName('mdc-icon-button');
                for (let i = 0; i < iconButtons.length; i++) {
                    new mdc.ripple.MDCRipple(iconButtons[i]).unbounded = true;
                }

                let checkBoxes = $('.mdc-checkbox');
                for (let i = 0; i < checkBoxes.length; i++) {
                    new mdc.checkbox.MDCCheckbox(checkBoxes[i]);

                }

                $("#new_account_submit").click(function() {
                    if (!newAccount()) {
                        showSnackbar(basicSnackbar, "New account username and password cannot be empty");
                    }
                });

                $("#new_account_submit").keypress(function(e) {
                    var key = e.which;
                    if (key === 13) {
                        e.preventDefault();
                    }
                });

                $('.account_usernames').blur(submitCheck);

                $('.account_passwords').blur(submitCheck);

                $('.account_privileges').blur(submitCheck);

                $(".account_disable").click(disableAccount);

                $(".account_delete").click(deleteAccount);



                if (scrollHeight != null) accounts.scrollTop(accounts[0].scrollHeight - scrollHeight);
            }
        });
    };

    var updateAccount = function(data, url) {
        postRequest("/accounts/" + url, data, function(xmlHttpRequest) {
            getInitialHash();
            if (xmlHttpRequest.status === 200) {
                $("#currentUsername").text(currentUsername);
                $("#accountCard").first().find("h2").text(currentUsername);
            }

            if (xmlHttpRequest.status !== 200) showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
            if (xmlHttpRequest.status !== 200 || (xmlHttpRequest.status === 200 && (url === "delete" || url === "new"))) {
                scrollHeight = accounts[0].scrollHeight - accounts.scrollTop();
                getAccounts();
            }
        });
    };

    var getInitialHash = function() {
        getRequest("/accounts/list/hash", function(xmlHttpRequest) {
            if (xmlHttpRequest.status === 200) {
                initialMD5 = xmlHttpRequest.responseText;
            }
        });
    };

    getAccounts();
    getInitialHash();

    var submit = function() {
        var postDictionary = {};

        var privilegeInputs = $(".account_privileges");
        privilegeInputs.each(function(index) {
            var id = $(this)[0].name;
            var newPrivilege = $(this).val().trim();

            postDictionary[id] = {};

            if (newPrivilege.toUpperCase() === "ADMIN") newPrivilege = 100;
            if (newPrivilege > 100) {
                newPrivilege = 100;
                if (currentUsername !== "admin" && inputStorage["privilege"][id] !== 100) newPrivilege -= 1;
            }


            if (inputStorage["privilege"][id] !== Number(newPrivilege) && newPrivilege !== "") {
                if (newPrivilege !== 100 && (isNaN(newPrivilege) || newPrivilege < 0)) {
                    showSnackbar(basicSnackbar, "Privilege level must be a positive number");
                    return true;
                }
                inputStorage["privilege"][id] = Number(newPrivilege);
                if (id === currentID) {
                    currentPrivilege = newPrivilege;
                }
                if (newPrivilege === 100) newPrivilege = "ADMIN";
                postDictionary[id]["new_privilege"] = newPrivilege;
            }
            if (newPrivilege === "") {
                var oldPrivilege = inputStorage["privilege"][id];
                if (oldPrivilege === 100) oldPrivilege = "ADMIN";
                $(this).val(oldPrivilege);
            } else {
                if (newPrivilege === 100) newPrivilege = "ADMIN";
                $(this).val(newPrivilege);
            }
        });

        var passwordInputs = $(".account_passwords");
        passwordInputs.each(function(index) {
            var id = $(this)[0].name;
            var newPassword = $(this).val();

            if (newPassword.trim() !== "") {
                postDictionary[id]["new_password"] = newPassword;
            }
            $(this).val("");
        });

        var usernameInputs = $(".account_usernames");
        usernameInputs.each(function(index) {
            var id = $(this)[0].name;
            var newUsername = $(this).val().trim();

            if (inputStorage["username"][id] !== newUsername && newUsername !== "") {
                inputStorage["username"][id] = newUsername;
                if (id === currentID) {
                    currentUsername = newUsername;
                }
                postDictionary[id]["new_username"] = newUsername;
			}
			if (newUsername === "") {
				$(this).val(inputStorage["username"][id]);
			} else {
				$(this).val(newUsername);
			}
        });

        var noChange = true;
        for (var id in postDictionary) {
            if (postDictionary.hasOwnProperty(id)) {
                var data = postDictionary[id];
                if (Object.keys(data).length === 0) {
                    continue;
                }
                noChange = false;
                var postBody = "id=" + encodeURIComponent(id) + "&";
                if (data.hasOwnProperty("new_username")) {
                    var newUsername = data["new_username"];
                    postBody += "new_username=" + encodeURIComponent(newUsername);
                    updateAccount(postBody, "update/username");
                }
                postBody = "id=" + encodeURIComponent(id) + "&";
                if (data.hasOwnProperty("new_password")) {
                    var newPassword = data["new_password"];
                    postBody += "new_password=" + encodeURIComponent(newPassword);
                    updateAccount(postBody, "update/password");
                }
                postBody = "id=" + encodeURIComponent(id) + "&";
                if (data.hasOwnProperty("new_privilege")) {
                    var newPrivilege = data["new_privilege"];
                    postBody += "new_privilege=" + encodeURIComponent(newPrivilege);
                    updateAccount(postBody, "update/privilege");
                }
            }
        }

        if (newAccount()) noChange = false;

        if (noChange) {
            //showSnackbar(basicSnackbar, "No changes were made");
        }
    };

    var submitCheck = function() {
        getRequest("/accounts/list/hash", function (xmlHttpRequest) {
            if (xmlHttpRequest.status === 200) {
                if (xmlHttpRequest.responseURL.search("login") !== -1) {
                    window.location = "/logout";
                }
                var md5 = xmlHttpRequest.responseText;
                if (initialMD5 === md5) {
                    submit();
                } else {
                    showDialog(yesNoDialog, "MakCloud", "Changes have been made since you entered this site.\nDo you want to override those changes?", {"yes": function() {submit();}});
                }
            }
        });
    };

    $(document).keypress(function(e) {
        var key = e.which;
        if (key === 13) {
            document.activeElement.blur();
            submitCheck();
        }
    });

    var newAccount = function() {
		if (currentPrivilege > 0 || currentUsername === "admin") {

			var usernameInput = $("#new_account_username");
			var passwordInput = $("#new_account_password");
			var privilegeInput = $("#new_account_privilege");

			var username = usernameInput.val();
			var password = passwordInput.val();
            var privilege = privilegeInput.val();

            if (privilege.toUpperCase() !== "ADMIN" && (isNaN(privilege) || privilege < 0)) {
                showSnackbar(basicSnackbar, "Privilege level must be a positive number");
                return false;
            }

            if (!isNaN(privilege) && privilege > 100) {
                privilege = 100;
                if (currentUsername !== "admin") privilege -= 1;
                privilege = privilege.toString();
            }

			if (username.trim() !== "" && password.trim() !== "") {
				var data = "username=" + encodeURIComponent(username.trim()) + "&password=" + encodeURIComponent(password);
				if (privilege.trim() !== "") data += "&privilege=" + encodeURIComponent(privilege);
				updateAccount(data, "new");
				return true;
			}
		}
        return false;
    };

    var disableAccount = function() {
        var id = $(this).attr("name");
        var data = "id=" + encodeURIComponent(id);
        if ($(this).find("input").is(":checked")) {
            updateAccount(data, "enable");
        } else {
            updateAccount(data, "disable");

        }
    };

    var deleteAccount = function() {
        var id = $(this)[0].name;
        var data = "id=" + encodeURIComponent(id);

        var prompt = "Are you sure you want to delete " + inputStorage["username"][id] + "?";
        if (currentID === id) {
            prompt = "Are you sure you want to delete your account?";
        }

        showDialog(yesNoDialog, "MakCloud", prompt, {"yes": function() {
            updateAccount(data, "delete");
            if (currentID === id) {
                window.location = "/logout";
            }
        }});
    };

});
