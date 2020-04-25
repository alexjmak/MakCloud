let usedPasswordMemory;
let authorized = false;

const supportedTypes = ["txt", "json", "conf", "log", "properties", "yml", "pdf", "apng", "bmp", "gif", "ico", "cur", "jpg", "jpeg", "pjpeg", "pjp", "png", "svg", "webp", "mp3", "m4a"];
const plainText = ["txt", "json", "conf", "log", "properties", "yml"];
let oldFileContents;

let getFile = function(filePath, mode, authorization) {
    getRequest(filePath + "?" + mode, function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            let content = $("#content");
            content.show();
            if (mode === "authorize") {
                authorized = true;
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
                $("#edit").show();
                hideAuthorization();
            }

        } else if (xmlHttpRequest.status === 401 || xmlHttpRequest.status === 403) {
            showAuthorization();
            if (authorization !== undefined) {
                $("#message").text(xmlHttpRequest.responseText);
                $("#password").val("");
            }
        } else if (xmlHttpRequest.status === 0) {
            $("#message").text("No connection");
            usedPasswordMemory = "";
        }
    }, authorization);
};

var save = function(event) {
    const filePath = event.data.filePath;
    const newFileContents = $("#fileContents").text();
    let blob = new Blob([newFileContents]);
    let formData = new FormData();
    formData.append('fileContents', filePath);
    formData.append('data', blob);

    request("PUT", filePath, formData, function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
        }
    }, undefined, null);
};

var revert = function(event) {
    $("#fileContents").text(event.data.initialFileContents);
};

var deleteFile = function(event) {
    if (window.location.pathname.startsWith("/shared")) return;
    let fileName = event.data.filePath.split("/").pop();
    showDialog(yesNoDialog, "MakCloud", "Are you sure you want to delete " + fileName  + "?", {"yes": function() {
            deleteRequest(event.data.filePath, null, function(xmlHttpRequest) {
                if (xmlHttpRequest.status === 200)  {
                    showSnackbar(basicSnackbar, "Deleted " + fileName);
                    window.location.href = '.';
                } else {
                    showSnackbar(basicSnackbar, "Error deleting " + fileName);
                }
            });
        }});
};

var edit = function(event) {
    const filePath = event.data.filePath;
    const extension = filePath.split(".").pop().toLowerCase();
    if (!authorized || !plainText.includes(extension)) return;
    let fileContents = $("#fileContents").text();

    let mode = $("#edit").find("span").text();
    if (mode === "Save") {
        if (fileContents !== oldFileContents) save(event);
        $("#fileContents").prop("contenteditable", false);
        $("#edit").find("i").text("edit");
        $("#edit").find("span").text("Edit");
    } else {
        oldFileContents = fileContents;
        $("#fileContents").prop("contenteditable", true);
        $("#edit").find("i").text("save");
        $("#edit").find("span").text("Save");

    }

};

var download = function(event) {
    if (!authorized) return;
    window.open(event.data.filePath + "?download", "_blank");
};

var randomNumberArray = new Uint32Array(1);
window.crypto.getRandomValues(randomNumberArray);

var authorize = function(event) {
    let password = $("#password").val();
    if (password === "") {
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

    if (window.location.pathname.startsWith("/shared")) {
        $("#share").hide();
        $("#delete").hide();
    }

    getFile(filePath, "authorize");

    $("#edit").click({filePath: filePath}, edit);

    $("#download").click({filePath: filePath}, download);

    $("#share").click({filePath: filePath}, share);

    $("#delete").click({filePath: filePath}, deleteFile);

    $("#submit").click({filePath: filePath}, authorize);
});

$(document).keydown(function(event) {
    var key = event.which;
    if (key === 13) {
        authorize({data: {filePath: filePath}})
    }

    if ((event.ctrlKey || event.metaKey) && key === 83) {
        event.preventDefault();
        let mode = $("#edit").find("span").text();
        if (mode === "Save") $("#edit").trigger("click");
    }
});

$(window).on("beforeunload", function() {
    let mode = $("#edit").find("span").text();
    if (mode === "Save") return "Changes you made may not be saved.";
});

