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
        files.append("<tr class='file' id='" + file + "'><td><p>" + file + "</p></td></tr>");

    }

    $(".file").dblclick(function() {
        window.location = location.pathname + "/" + this.id + "?edit";
    });

    $(document).click(function (e) {
        if (!$(".file").is(e.target) && $(".file").has(e.target).length === 0) {
            setTimeout(function() {
                $(".file").css("background-color", "")
            }, 0)

        }

    });

    $(".file").click(function() {
        $(".file").css("background-color", "")
        $(this).css("background-color", "lightgray")
    });



    $("#back").click(function() {
        window.open(location.pathname + "/..", "_self");
    });

});

function deselectAll() {

}