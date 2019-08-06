$(document).ready(function() {
    if (window.location.pathname === "/login" || $.cookie("token") === undefined) {
        $('#accountButton').click(function() {
            window.location.href = "/login";
        });
    }

    const topAppBar = mdc.topAppBar.MDCTopAppBar.attachTo(document.querySelector('.mdc-top-app-bar'));
    const drawer = mdc.list.MDCList.attachTo(document.querySelector('.mdc-list'));
    var textFields = document.getElementsByClassName('mdc-text-field');
    var i;
    for (i = 0; i < textFields.length; i++) {
        new mdc.textField.MDCTextField(textFields[i]);
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

    topAppBar.listen('MDCTopAppBar:nav', function () {
        drawer.open = true;
    });

    let accountCard = $("#accountCard");
    if ($.cookie("token") !== undefined) {
        accountCard.first().find("h3").text("ID: " + parseJwt($.cookie("token")).subject);
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
        if (!accountCard.is(":visible") && $.cookie("token") !== undefined) {
            accountCard.show();
        }
    });

    $("#accountButton").click(function() {
        if (!accountCard.is(":visible") && $.cookie("token") !== undefined) {
            accountCard.show();
        }
    });

});