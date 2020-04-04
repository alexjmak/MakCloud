let isMobile;

$(document).ready(function() {
    checkMobileResize();
    $(window).resize(checkMobileResize);

    if (window.location.pathname === "/login" || $.cookie("loginToken") === undefined) {
        $('#accountButton').click(function() {
            window.location.href = "/login";
        });
    }

    const topAppBar = mdc.topAppBar.MDCTopAppBar.attachTo(document.querySelector('.mdc-top-app-bar'));

    try {
        const drawer = mdc.drawer.MDCDrawer.attachTo(document.querySelector('.mdc-drawer'));
        topAppBar.listen('MDCTopAppBar:nav', function () {
            drawer.open = !drawer.open;
        });
    } catch (e) {

    }

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
        if (!accountCard.is(":visible") && $.cookie("loginToken") !== undefined) {
            accountCard.show();
        } else if ($.cookie("loginToken") === undefined) {
            window.location = "/accounts";
        }
    });

});

function checkMobileResize() {
    let width = $(window).width();
    let height = $(window).height();
    isMobile = height > width;
    if (height > width && $(".mdc-drawer").length !== 0) {
        $(".mdc-drawer").addClass("mdc-drawer--modal");
        $(".mdc-top-app-bar__navigation-icon").show();
    } else {
        $(".mdc-drawer").removeClass("mdc-drawer--modal");
        $(".mdc-top-app-bar__navigation-icon").hide();
    }
}