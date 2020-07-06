let isMobile;
/*console.log($(document.documentElement)[0].style)
$(document.documentElement)[0].style.backgroundColor = "#181818"
$(document.documentElement)[0].style.color = "white";
*/
$(document).ready(function() {
    checkMobileResize();
    $(window).resize(checkMobileResize);

    const topAppBar = mdc.topAppBar.MDCTopAppBar.attachTo(document.querySelector('.mdc-top-app-bar'));


    let drawer;
    topAppBar.listen('MDCTopAppBar:nav', function () {
        if (!drawer) drawer = mdc.drawer.MDCDrawer.attachTo(document.querySelector('.mdc-drawer'));
        drawer.open = !drawer.open;
    });


    let textFields = document.getElementsByClassName('mdc-text-field');
    for (let i = 0; i < textFields.length; i++) {
        new mdc.textField.MDCTextField(textFields[i]);
    }

    let buttons = document.getElementsByClassName('mdc-button');
    for (let i = 0; i < buttons.length; i++) {
        mdc.ripple.MDCRipple.attachTo(buttons[i]);
    }

    let iconButtons = document.getElementsByClassName('mdc-icon-button');
    for (let i = 0; i < iconButtons.length; i++) {
        new mdc.ripple.MDCRipple(iconButtons[i]).unbounded = true;
    }

    let checkBoxes = $('.mdc-checkbox');
    for (let i = 0; i < checkBoxes.length; i++) {
        new mdc.checkbox.MDCCheckbox(checkBoxes[i]);

    }

    /*
    let listItems = $(".mdc-list-item");
    listItems.each(function() {
        let listItem = $(this);
        if ((window.location.pathname + "/").startsWith(listItem.attr("href") + "/")) {
            listItems.removeClass("mdc-list-item--activated");
            listItem.attr("class", "mdc-list-item mdc-list-item--activated");
            return false;
        }
    });

    */

    let accountCard = $("#accountCard");
    if ($.cookie("loginToken") !== undefined) {
        accountCard.first().find("h3").text("ID: " + parseJwt($.cookie("loginToken")).aud);
    }

    $(document).mouseup(function (e) {
        if (accountCard.is(":visible")) {
            if (!accountCard.is(e.target) && accountCard.has(e.target).length === 0) {
                setTimeout(function() {
                    accountCard.hide();
                }, 0)

            }
        }
    });

    $("#currentUsername").click(function() {
        if (!accountCard.is(":visible") && $.cookie("loginToken") !== undefined) {
            accountCard.show();
        }
    });

    $("#accountButton").click(function() {
        if (window.location.pathname === "/login") return;
        if (!accountCard.is(":visible") && $.cookie("loginToken") !== undefined) {
            accountCard.show();
        } else if (!$.cookie("loginToken")) {
            window.location = "/login";
        }
    });

    $("#back").click(function() {
        window.open(location.pathname + "/..", "_self");
    });

    $("#logout").click(function() {
        $.removeCookie("fileToken", { path: location.pathname.split("/").slice(0, 4).join("/") });
        window.location.href = "/logout";
    });

    $("#upload").click(function() {
        $("#uploadButton").val("");
        $("#uploadButton").trigger("click");
    });

    $("#uploadButton").change(function() {
        let formData = new FormData();
        let files = $(this)[0].files;
        for (let i = 0; i < files.length; i++) {
            formData.append("file" + i, files[i]);
        }

        request("POST", location.pathname + "?upload", formData, function(xmlHttpRequest) {
            console.log(xmlHttpRequest.status)
            showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
        }, undefined, null);
    });

});

function checkMobileResize() {
    let width = $(window).width();
    let height = $(window).height();
    let drawer = $(".mdc-drawer");
    let mobile = $(".mobile");
    let smallWidth = (drawer.width() / width) > 0.25;

    isMobile = height > width;

    if ((height > width && drawer.length !== 0) || smallWidth)  {
        drawer.addClass("mdc-drawer--modal");
        mobile.show();
    } else {
        drawer.removeClass("mdc-drawer--modal");
        mobile.hide();
    }
}