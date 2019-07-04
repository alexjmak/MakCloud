
$(document).ready(function() {
    var topAppBarElement = document.querySelector('.mdc-top-app-bar');
    var topAppBar = new mdc.topAppBar.MDCTopAppBar(topAppBarElement);
    var main = $("#main_");
    var username = $("#username");
    var password = $("#password");

    var initialMD5 = null;
    var scrollHeight = null;
    var x = document.getElementsByClassName('mdc-text-field');
    var i;
    for (i = 0; i < x.length; i++) {
        new mdc.textField.MDCTextField(x[i]);
    }

    $("#computername").text($.cookie("host"));
    $.removeCookie("host");

    var login = function (xmlHttpRequest) {
        if (xmlHttpRequest.status == 200) {
            $("#message").html("");
            var redirect = getQueryVariable("redirect");
            if (redirect != null) {
                window.location = redirect;
            } else {
                window.location = "/";
            }

        } else {
            $("#message").text(xmlHttpRequest.responseText);
        }

    };

    var submit = function() {
      getRequest("/login/token", login, "Basic " + btoa(username.val().trim() + ":" + password.val()));
    };

    $(document).keypress(function(e) {
        var key = e.which;
        if (key == 13) {
            if ($("#username").is(":focus") && $("#password").val() === "") {
                $("#password").focus();
            } else {
                submit();
            }

        }
    });

    $("#submit").click(submit);

});

