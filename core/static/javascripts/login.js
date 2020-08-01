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
                $("#message").text("Please enable cookies");
            } else {
                location.reload();
            }


        } else if (xmlHttpRequest.status === 0) {
            $("#message").text("Connection lost");
        } else {
            if (xmlHttpRequest.status === 429) {
                firewall = true;
                $("#submit").prop("disabled", true);
                setTimeout(function() {
                    location.reload();
                }, 10000);
            }
            $("#password").val("");
            $("#message").text(xmlHttpRequest.responseText);
        }

    };

    let randomNumberArray = new Uint32Array(1);
    window.crypto.getRandomValues(randomNumberArray);

    let submit = function() {
        if (firewall) return;

        let usernameValue = username.val().trim();
        let passwordValue = password.val();

        if (usernameValue === "") {
            let message = "Enter your username";
            if (!username.is(":focus")) {
                if ($("#message").text() !== message) $("#message").text("");
                username.focus();
            }
            else {
                $("#message").text(message);
            }
            return;
        }

        if (passwordValue === "") {
            let message = "Enter your password";
            if (!password.is(":focus")) {
                if ($("#message").text() !== message) $("#message").text("");
                password.focus();
            }
            else {
                $("#message").text(message);
            }
            return;
        }



        getRequest("/login/token", login, "Basic " + btoa(encodeURIComponent(usernameValue) + ":" + encodeURIComponent(passwordValue)));
    };


    $(document).keypress(function(e) {
        let key = e.which;
        if (key === 13) {
            submit();

        }
    });

    $("#submit").click(submit);

    if (firewall) {
        showFirewall();
    }

});

function showFirewall() {
    $("#submit").prop("disabled", true);
    let message = firewall.charAt(0).toUpperCase() + firewall.slice(1);
    if (firewallEnd) {
        let expiration = new Date(firewallEnd)
        if (!isNaN(expiration.getTime())) {
            message += " until " + expiration.toLocaleString();
            let timeout = firewallEnd - Date.now();
            if (timeout < 0) timeout *= -1;
            if (timeout + 3000 <= Math.pow(2, 31) - 1) {
                setTimeout(function() {
                    location.reload();
                }, timeout + 3000);
            }
        }
    }
    $("#message").text(message);


}