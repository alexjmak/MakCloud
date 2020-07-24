let usedPasswordMemory;
let authorized = false;

const supportedTypes = ["txt", "json", "conf", "log", "properties", "yml", "pdf", "apng", "bmp", "gif", "ico", "cur", "jpg", "jpeg", "pjpeg", "pjp", "png", "svg", "webp", "mp3", "m4a", "py", "js"];
const plainText = ["txt", "json", "conf", "log", "properties", "yml", "py", "js"];
let oldFileContents;

const pathSplit = location.pathname.split("/");
const filePath = decodeURIComponent(pathSplit[pathSplit.length - 1]);
const displayName = name_decrypted ? name_decrypted : filePath;

let requestFile = function(method, authorization, next) {
    request(method, filePath, null, function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {
            let content = $("#content");
            content.show();
            if (method.toUpperCase() === "HEAD") {
                authorized = true;
                let extension = displayName.split(".").pop().toLowerCase();
                let contentType = xmlHttpRequest.getResponseHeader("Content-Type");
                if (supportedTypes.includes(extension) || contentType.startsWith("text/")) {
                    let encodedPathname = window.location.pathname.replace("'", "%27");
                    switch (extension) {
                        default:
                            requestFile("GET");
                            break;
                        case "pdf":
                            content.append("<object data='/pdfjs/web/viewer.html?file=" + encodedPathname + "'></object>")
                            break;
                        case "apng": case "bmp": case "gif": case "ico": case "cur": case "jpg":
                        case "jpeg": case "pjpeg": case "pjp": case "png": case ".svg": case "webp":
                            content.append("<img class='mdc-elevation--z10' src='" + encodedPathname + "'>");
                            break;
                        case "mp3": case "m4a":
                            let audio = new Audio(encodedPathname);
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
            if (method.toUpperCase() === "GET") {
                content.append("<pre id='fileContents' class='selectable mdc-elevation--z10'></pre>");
                $("#fileContents").text(xmlHttpRequest.responseText);
                $("#edit").show();
                hideAuthorization();
            }

        } else if (xmlHttpRequest.status === 401 || xmlHttpRequest.status === 403) {
            showAuthorization();
            if (authorization !== undefined) {
                $("#message").text("Incorrect password");
                $("#password").val("");
            }
        } else if (xmlHttpRequest.status === 0) {
            $("#message").text("Connection lost");
            usedPasswordMemory = "";
        }
        if (next) next(true);
    }, authorization);
};

var save = function() {
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

var deleteFile = function() {
    if (window.location.pathname.startsWith("/shared")) return;
    showDialog(yesNoDialog, "MakCloud", "Are you sure you want to delete " + displayName  + "?", {"yes": function() {
            deleteRequest(filePath, null, function(xmlHttpRequest) {
                if (xmlHttpRequest.status === 200)  {
                    showSnackbar(basicSnackbar, "Deleted " + displayName);
                    window.location.href = '.';
                } else {
                    showSnackbar(basicSnackbar, "Error deleting " + displayName);
                }
            });
    }});
};

var edit = function() {
    const extension = filePath.split(".").pop().toLowerCase();
    if (!authorized || !plainText.includes(extension)) return;
    let fileContents = $("#fileContents").text();

    let mode = $("#edit").find("span").text();
    if (mode === "Save") {
        if (fileContents !== oldFileContents) save();
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

var download = function() {
    if (!authorized) {
        authorize(function(result) {
            if (result) download();
        });
    } else {
        window.open(filePath + "?download", "_blank");
    }
};

var randomNumberArray = new Uint32Array(1);
window.crypto.getRandomValues(randomNumberArray);

var authorize = function(next) {
    let password = $("#password").val();
    if (password === "") {
        $("#password").focus()
        if (next) next(false);
    } else {
        if ($.md5(password, randomNumberArray[0]) === usedPasswordMemory) return;
        usedPasswordMemory = $.md5(password, randomNumberArray[0]);
        password = btoa(":"+ password);
        requestFile("HEAD", "Basic " + password, next)
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

    $(".mdc-drawer__title").text(displayName);

    if (window.location.pathname.startsWith("/shared")) {
        $("#file-manager").hide();
        $("#share").hide();
        $("#delete").hide();
        $("#back").hide();
        $("#save").show();
    }

    requestFile("HEAD");

    $("#edit").click(edit);

    $("#download").click(download);

    $("#share").click(share);

    $("#delete").click(deleteFile);

    $("#submit").click(authorize);
});

$(document).keydown(function(event) {
    var key = event.which;
    if (key === 13) {
        authorize()
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

