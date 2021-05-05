$.ajaxSetup({
    cache: true
});

$.getScript("/core/javascripts/layout.js");

(() => {
    const encryptionTimeout = $.cookie("encryptionTimeout");
    if (encryptionTimeout) {
        setTimeout(() => location.reload(), parseInt(encryptionTimeout) + 5 * 1000);
    }
})();