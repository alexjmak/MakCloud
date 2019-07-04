$(document).ready(function() {
    if (window.location.pathname === "/login") {
        $('#accountButton').attr("disabled", true);
    }
    const topAppBar = mdc.topAppBar.MDCTopAppBar.attachTo(document.querySelector('.mdc-top-app-bar'));
    const drawer = mdc.drawer.MDCDrawer.attachTo(document.querySelector('.mdc-drawer'));

    let listItems = $(".mdc-list-item");
    listItems.each(function() {
        let listItem = $(this);
        if ((window.location.pathname + "/").startsWith(listItem.attr("href") + "/")) {
            listItems.removeClass("mdc-list-item--activated");
            listItem.attr("class", "mdc-list-item mdc-list-item--activated");
            return false;
        }
    });

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
    })

    $("#currentUsername").click(function() {
        if (!accountCard.is(":visible")) {
            accountCard.show();
        }
    });

    $("#accountButton").click(function() {
        if (!accountCard.is(":visible")) {
            accountCard.show();
        }
    });

});