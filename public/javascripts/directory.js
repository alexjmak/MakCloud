$(document).ready(function() {
    var x = document.getElementsByClassName('mdc-button');
    var i;
    for (i = 0; i < x.length; i++) {
        mdc.ripple.MDCRipple.attachTo(x[i]);
    }

    $("#folder").text(location.pathname);

    var files = $("#files");

    for (var fileIndex in folderContents) {
        var file = folderContents[fileIndex];
        if (file == "..") {
            var backButton = $("#back");
            backButton.click(function() {
                window.open(location.pathname + "/..", "_self");
            });
            backButton.prop("hidden", false);
            continue;
        }
        files.append("<a href=\"" + location.pathname + "/" + file + "?edit\">" + file + "</a><br>")
    }

    $("#back").click(function() {
        window.open(location.pathname + "/..", "_self");
    });

});