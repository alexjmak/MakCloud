$(document).ready(function() {
    for (let photo in photos) {
        if (!photos.hasOwnProperty(photo)) continue;
        photo = photos[photo];
        if (photo === "") continue;
        $("#content").append("<a href='/photos/" + photo + "'><img class='mdc-elevation--z3 lazyload' loading='lazy' data-src='/photos/" + photo + "?download'></a>")
    }
    //$("#content").justifiedGallery();

});