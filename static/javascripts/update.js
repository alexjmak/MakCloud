$(document).ready(function() {
    let server = $("#server");
    let submitButton = $("#submit");
    let enabled = true;

    function toggleEnabled() {
        if (enabled) {
            enabled = false;
            server.prop("disabled", true);
            submitButton.prop("disabled", true);
        } else {
            enabled = true;
            server.prop("disabled", false);
            submitButton.prop("disabled", false);
        }
    }

    function submit() {
        if (server.val().trim() === "") {
            server.focus();
        } else {
            if (!enabled) return;
            toggleEnabled();
            postRequest("/update", JSON.stringify({"server": server.val()}), function(xmlHttpRequest) {
                toggleEnabled();
                if (xmlHttpRequest.status === 200) {
                    showSnackbar(basicSnackbar, "Update complete")
                } else if (xmlHttpRequest.status === 0) {
                    showSnackbar(basicSnackbar, "Connection lost. Server may be restarting.");
                } else {
                    showSnackbar(basicSnackbar, "Update failed");
                }
            });
        }
    }

    $(document).keypress(function(e) {
        let key = e.which;
        if (key === 13) {
            submit();
        }
    });

    submitButton.click(submit);

});
