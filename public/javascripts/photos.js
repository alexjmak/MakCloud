$(document).ready(function() {
    $("#upload").click(function() {
        $("#uploadButton").trigger("click");
    });

    for (let photo in photos) {
        if (!photos.hasOwnProperty(photo)) continue;
        photo = photos[photo];
        $("#content").append("<a href='/photos/" + photo + "'><img class='mdc-elevation--z3' src='/photos/" + photo + "?download'></a>")

    }

});