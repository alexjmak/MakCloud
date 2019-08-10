let usedPasswordMemory;

var getFile = function(filePath, mode, authorization) {
    getRequest(filePath + "?" + mode, function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 200) {

            if (mode === "authorize") {
                var supportedTypes = ["txt", "json", "log", "properties", "yml"];

                var fileEditor = $("#fileContents");
                if (supportedTypes.includes(filePath.split(".").pop())) {
                    getFile(filePath, "download");
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

        } else if (xmlHttpRequest.status === 401) {
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

var download = function(event) {
    if ($("#fileContents").is(":hidden")) return;
    window.open(event.data.filePath + "?download", "_blank");
};

var share = function(event) {
    if ($("#fileContents").is(":hidden")) return;
    //showDialog(okDialog, "Share " + event.data.filePath, "<button class=\"mdc-button mdc-button--raised\">Get public link</button>");
    postRequest(event.data.filePath + "?sharing", "link={\"action\": \"create\",  \"password\": \"password\"}", function(xmlHttpRequest) {
        if (xmlHttpRequest.status === 201) {
            showDialog(okDialog, "Share " + event.data.filePath, location.protocol + '//' + location.hostname + xmlHttpRequest.responseText);
        } else {
            showDialog(okDialog, "Share " + event.data.filePath, "Link already created");
        }
    });

};

var randomNumberArray = new Uint32Array(1);
window.crypto.getRandomValues(randomNumberArray);

var authorize = function(event) {
    let password = $("#password").val();
    if (password.trim() === "") {
        $("#message").text("Enter the password");
        return;
    }
    if ($.md5(password, randomNumberArray[0]) === usedPasswordMemory) return;
    usedPasswordMemory = $.md5(password, randomNumberArray[0]);
    password = btoa(":"+ password);
    getFile(event.data.filePath, "authorize", "Basic " + password)
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