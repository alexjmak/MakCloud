let content = "";
for (let photo in photos) {
    if (!photos.hasOwnProperty(photo)) continue;
    photo = photos[photo];
    content += ("<a href='/photos/" + photo + "'><img class='mdc-elevation--z3 lazyload' loading='lazy' data-src='/photos/" + photo + "?download'></a>")
}

$(document).ready(function() {

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
            showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
        }, undefined, null);
    });

    $("#content").append(content);



});