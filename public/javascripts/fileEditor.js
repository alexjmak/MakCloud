let usedPasswordMemory;

var getFile = function(filePath, mode, authorization) {
    getRequest(filePath + "?" + mode, function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {

            if (mode === "authorize") {
                var supportedTypes = ["txt", "json", "log", "properties", "yml", "pdf"];


                var fileEditor = $("#fileContents");
                var extension = filePath.split(".").pop().toLowerCase();
                if (supportedTypes.includes(extension)) {
                    unsupportedFile = false;
                    if (extension === "pdf") {
                        fileEditor.after("<object data='/pdfjs/web/viewer.html?file=" + window.location.pathname + "?download'></object>")
                    } else getFile(filePath, "download");

                } else {
                    fileEditor.text("Can't open file type");
                    fileEditor.prop("contenteditable", false);
                    hideAuthorization();
                }
            }
            if (mode === "download") {
                $("#fileContents").text(xmlHttpRequest.responseText);
                hideAuthorization();
            }

        } else if (xmlHttpRequest.status === 401 || xmlHttpRequest.status === 403) {
            showAuthorization();
            if (authorization !== undefined) {
                $("#message").text(xmlHttpRequest.responseText);
            }
        } else if (xmlHttpRequest.status === 0) {
            $("#message").text("No connection");
            usedPasswordMemory = "";
        }
    }, authorization);
};

var save = function(event) {
    var filePath = event.data.filePath;
    var newFileContents = $("#fileContents").text();
    var data = "newFileContents=" + encodeURIComponent(newFileContents);

    postRequest(filePath, data, function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
        }
    });
};

var revert = function(event) {
    $("#fileContents").text(event.data.initialFileContents);
};

var deleteFile = function(event) {
    let fileName = event.data.filePath.split("/").pop();
    showDialog(yesNoDialog, "MakCloud", "Are you sure you want to delete " + fileName  + "?", {"yes": function() {
            deleteRequest(event.data.filePath, function(xmlHttpRequest) {
                if (xmlHttpRequest.status === 200)  {
                    showSnackbar(basicSnackbar, "Deleted " + fileName);
                    window.location.href = '.';
                } else {
                    showSnackbar(basicSnackbar, "Error deleting " + fileName);
                }
            });
        }});
};

var download = function(event) {
    window.open(event.data.filePath + "?download", "_blank");
};

var randomNumberArray = new Uint32Array(1);
window.crypto.getRandomValues(randomNumberArray);

var authorize = function(event) {
    let password = $("#password").val();

    if (password.trim() === "") {
        $("#password").focus()
    } else {
        if ($.md5(password, randomNumberArray[0]) === usedPasswordMemory) return;
        usedPasswordMemory = $.md5(password, randomNumberArray[0]);
        password = btoa(":"+ password);
        getFile(event.data.filePath, "authorize", "Basic " + password)
    }

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
    let pathSplit = filePath.split("/");
    if (pathSplit.length <= 1) {
        $("#back").hide();
    }

    filePath = pathSplit[pathSplit.length - 1];
    $(".mdc-drawer__title").text(filePath);


    getFile(filePath, "authorize");

    $("#back").click(function() {
        window.open(location.pathname + "/..", "_self");
    });
    
    $("#download").click({filePath: filePath}, download);

    $("#share").click({filePath: filePath}, share);

    $("#delete").click({filePath: filePath}, deleteFile);

    $(document).keypress(function(e) {
        var key = e.which;
        if (key === 13) {
            authorize({data: {filePath: filePath}})
        }
    });

    $("#submit").click({filePath: filePath}, authorize);

    $("#logout").click(function() {
        $.removeCookie("fileToken", { path: location.pathname.split("/").slice(0, 4).join("/") });
        window.location.href = "/logout";
    });
});