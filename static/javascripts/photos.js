$(document).ready(function() {
    for (let photo in photos) {
        if (!photos.hasOwnProperty(photo)) continue;
        photo = photos[photo];
        if (photo === "") continue;
        let photoLink = window.location.pathname + "/" + photo;
        $("#content").append(`<a href='${photoLink}?view'><img class='mdc-elevation--z3 lazyload' loading='lazy' data-src='${photoLink}'></a>`)
    }

    $("#download-current-dir").click(function () {
        window.location.href = location.pathname + "?download";
    });

    $("html").on("dragover", function(e) {
        e.preventDefault();
        e.stopPropagation();
    });

    $("html").on("drop", function(e) {
        const files = e.originalEvent.dataTransfer.files;
        uploadFiles(files);
        e.preventDefault(); e.stopPropagation();
    });

});

