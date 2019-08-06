var getFile = function(filePath, mode, authorization) {
    console.log(filePath);
    getRequest(filePath + "?" + mode, function(xmlHttpRequest) {
        console.log(xmlHttpRequest.status);
        if (xmlHttpRequest.status == 200) {
            hideAuthorization();

            if (mode === "preview") {
                var supportedTypes = ["txt", "json", "log", "properties", "yml"];

                var fileEditor = $("#fileContents");
                if (supportedTypes.includes(filePath.split(".").pop())) {
                    getFile(filePath, "download");
                } else {
                    hideAuthorization();
                    fileEditor.text("Can't open file type");
                    fileEditor.prop("contenteditable", false);
                }
            }
            if (mode == "download") {
                $("#fileContents").text(xmlHttpRequest.responseText);
            }

        } else if (xmlHttpRequest.status == 401) {
            showAuthorization();
            if (authorization !== undefined) {
                $("#message").text(xmlHttpRequest.responseText);
            }
        }
    }, authorization);
};

var save = function(event) {
    var filePath = event.data.filePath;
    var newFileContents = $("#fileContents").text();
    var data = "newFileContents=" + encodeURIComponent(newFileContents);

    postRequest(filePath, data, function(xmlHttpRequest) {
        if (xmlHttpRequest.status == 200) {
            showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
        }
    });
};

var revert = function(event) {
    $("#fileContents").text(event.data.initialFileContents);
};

var download = function(event) {
    if ($("#fileContents").is(":hidden")) return;
    window.open(event.data.filePath + "?download", "_blank");
};

var share = function(event) {
    if ($("#fileContents").is(":hidden")) return;
};

var authorize = function(event) {
    let password = $("#password").val();
    password = btoa(":"+ password);
    getFile(event.data.filePath, "preview", "Bearer " + password)
};

var showAuthorization = function()  {
    $("#fileContents").hide();
    $("#authorization").show();
    $("#password").focus();
};

var hideAuthorization = function()  {
    $("#message").text("");
    $("#authorization").hide();
    $("#fileContents").show();
};

$(document).ready(function() {
    var x = document.getElementsByClassName('mdc-button');
    var i;
    for (i = 0; i < x.length; i++) {
        mdc.ripple.MDCRipple.attachTo(x[i]);
    }

    let pathSplit = filePath.split("/");
    if (pathSplit.length <= 1) {
        $("#back").hide();
    }

    filePath = pathSplit[pathSplit.length - 1];
    $(".mdc-drawer__title").text(filePath);


    getFile(filePath, "preview");

    $("#back").click(function() {
        window.open(location.pathname + "/..", "_self");
    });
    
    $("#download").click({filePath: filePath}, download);

    $("#share").click({filePath: filePath}, share);

    $(document).keypress(function(e) {
        var key = e.which;
        if (key == 13) {
            authorize({data: {filePath: filePath}})
        }
    });

    $("#submit").click({filePath: filePath}, authorize);

    $("#logout").click(function() {
        $.removeCookie("fileToken", { path: location.pathname.split("/").slice(0, 4).join("/") });
        window.location.href = "/logout";
    });
});