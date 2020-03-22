let usedPasswordMemory;
let authorized = false;

let getFile = function(filePath, mode, authorization) {
    getRequest(filePath + "?" + mode, function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            let content = $("#content");
            content.show();
            if (mode === "authorize") {
                authorized = true;
                let supportedTypes = ["txt", "json", "log", "properties", "yml", "pdf", "apng", "bmp", "gif", "ico", "cur", "jpg", "jpeg", "pjpeg", "pjp", "png", "svg", "webp", "mp3", "m4a"];
                let extension = filePath.split(".").pop().toLowerCase();
                if (supportedTypes.includes(extension)) {
                    switch (extension) {
                        default:
                            getFile(filePath, "download");
                            break;
                        case "pdf":
                            content.append("<object data='/pdfjs/web/viewer.html?file=" + window.location.pathname + "?download'></object>")
                            break;
                        case "apng": case "bmp": case "gif": case "ico": case "cur": case "jpg":
                        case "jpeg": case "pjpeg": case "pjp": case "png": case ".svg": case "webp":
                            content.append("<img class='mdc-elevation--z10' src='" + window.location.pathname + "?download'>");
                            break;
                        case "mp3": case "m4a":
                            let audio = new Audio(window.location.pathname + "?download");
                            audio.play();
                            break;
                    }

                } else {
                    content.append("<pre id='fileContents' class='selectable mdc-elevation--z10'></pre>");
                    $("#fileContents").text("Can't open file type");
                    $("#fileContents").prop("contenteditable", false);
                    hideAuthorization();
                }
            }
            if (mode === "download") {
                content.append("<pre id='fileContents' class='selectable mdc-elevation--z10'></pre>");
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
    if (window.location.pathname.startsWith("/shared")) return;
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
    if (!authorized) return;
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
    authorized = false;
};

var hideAuthorization = function()  {
    $("#message").text("");
    $("#authorization").hide();
    authorized = true;
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