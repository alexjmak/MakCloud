$(document).ready(function() {

    $("#upload").click(function() {
        $("#uploadButton").val("");
        $("#uploadButton").trigger("click");
    });

    $("#uploadButton").change(function() {
        let formData = new FormData();
        let fileName = $(this)[0].files[0];
        formData.append("file", fileName);
        request("POST", location.pathname + "?upload", formData, function(xmlHttpRequest) {
            showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
        }, undefined, null);

    });

    for (let photo in photos) {
        if (!photos.hasOwnProperty(photo)) continue;
        photo = photos[photo];
        $("#content").append("<a href='/photos/" + photo + "'><img class='mdc-elevation--z3' src='/photos/" + photo + "?download'></a>")

    }

});