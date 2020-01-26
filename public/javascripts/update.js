$(document).ready(function() {
    let server = $("#server");


    function submit() {
        if (server.val().trim() === "") {
            server.focus();
        } else {
            postRequest("/update", "server=" + server.val(), function(xmlHttpRequest) {
                if (xmlHttpRequest.status === 200) {
                    showSnackbar(basicSnackbar, "Update complete")
                }
            })
        }

    }

    $(document).keypress(function(e) {
        let key = e.which;
        if (key === 13) {
            submit();
        }
    });

    $("#submit").click(submit);

});
