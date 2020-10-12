$(document).ready(function() {
    let username = $("#username");
    let password = $("#password");

    $("header").find("button").prop("onclick", null);
    $("header").find("h3").prop("onclick", null);

    let login = function (xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            if ($.cookie("loginToken")) {
                $("#message").html("");
                let redirect = getQueryVariable("redirect");
                if (redirect != null) {
                    window.location = redirect;
                } else {
                    window.location = "/";
                }
            } else if (new URL(xmlHttpRequest.responseURL).pathname !== "/login") {
                $("#message").text(locale.enable_cookies);
            } else {
                location.reload();
            }


        } else if (xmlHttpRequest.status === 0) {
            $("#message").text(locale.no_connection);
        } else {
            if (xmlHttpRequest.status === 429) {
                firewall = 0;
                $("#submit").prop("disabled", true);
                setTimeout(function() {
                    location.reload();
                }, 10000);
            }
            $("#password").val("");
            $("#message").text(xmlHttpRequest.responseText);
        }

    };

    const randomNumberArray = new Uint32Array(1);
    window.crypto.getRandomValues(randomNumberArray);

    let submit = function() {
        if (!isNaN(firewall)) return;

        let usernameValue = username.val().trim();
        let passwordValue = password.val();

        if (usernameValue === "") {
            let message = locale.enter_your_username;
            if (!username.is(":focus")) {
                if ($("#message").text() !== message) $("#message").text("");
                username.focus();
            } else {
                $("#message").text(message);
            }
            return;
        }

        if (passwordValue === "") {
            let message = locale.enter_your_password;
            if (!password.is(":focus")) {
                if ($("#message").text() !== message) $("#message").text("");
                password.focus();
            }
            else {
                $("#message").text(message);
            }
            return;
        }

        const authorization = btoa(encodeURIComponent(usernameValue) + ":" + encodeURIComponent(passwordValue));
        getRequest("/login/token", login, "Basic " + authorization);
    };


    $(document).keypress(function(e) {
        let key = e.which;
        if (key === 13) {
            submit();

        }
    });

    $("#submit").click(submit);

    if (!isNaN(firewall)) {
        showFirewall();
    }

});

function showFirewall() {
    $("#submit").prop("disabled", true);
    let message;
    if (firewall === 0) {
        if (firewallEnd) {
            const expiration = new Date(firewallEnd)
            if (!isNaN(expiration.getTime())) {
                message = locale.blacklisted_until.replace("{0}", expiration.toLocaleString());
                let timeout = firewallEnd - Date.now();
                if (timeout < 0) timeout *= -1;
                if (timeout + 3000 <= Math.pow(2, 31) - 1) {
                    setTimeout(function() {
                        location.reload();
                    }, timeout + 3000);
                }
            }
        } else {
            message = locale.blacklisted;
        }
    } else {
        message = locale.not_whitelisted;
    }
    $("#message").text(message);
}