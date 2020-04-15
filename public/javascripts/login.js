let usedCredentialsMemory;

$(document).ready(function() {
    let username = $("#username");
    let password = $("#password");

    let login = function (xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            $("#message").html("");
            let redirect = getQueryVariable("redirect");
            if (redirect != null) {
                window.location = redirect;
            } else {
                window.location = "/";
            }

        } else if (xmlHttpRequest.status === 0) {
            $("#message").text("No connection");
            usedCredentialsMemory = "";
        } else {
            if (xmlHttpRequest.status === 403) usedCredentialsMemory = "";
            $("#password").val("");
            $("#message").text(xmlHttpRequest.responseText);
        }

    };

    let randomNumberArray = new Uint32Array(1);
    window.crypto.getRandomValues(randomNumberArray);

    let submit = function() {
        let usernameValue = username.val().trim();
        let passwordValue = password.val();
        if (usernameValue.trim() === "") {
            $("#message").text("Enter your username");
            return;
        } else if (passwordValue.trim() === "") {
            $("#message").text("Enter your password");
            return;
        }
        if ($.md5(usernameValue + ":" + passwordValue, randomNumberArray[0]) === usedCredentialsMemory) return;
        usedCredentialsMemory = $.md5(usernameValue + ":" + passwordValue, randomNumberArray[0]);
        getRequest("/login/token", login, "Basic " + btoa(usernameValue + ":" + passwordValue));
    };

    $(document).keypress(function(e) {
        let key = e.which;
        if (key === 13) {
            if (username.is(":focus") && password.val() === "") {
                if ($("#message").text() !== "") $("#message").text("");
                password.focus();
            } else {
                submit();
            }

        }
    });

    $("#submit").click(submit);

});

