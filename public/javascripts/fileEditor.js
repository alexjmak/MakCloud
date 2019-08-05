var getFile = function(filePath) {
    filePath += "?download";
    getRequest(filePath, function(xmlHttpRequest) {
        if (xmlHttpRequest.status == 200) {
            $("#fileContents").text(xmlHttpRequest.responseText);
            $("#revert").unbind();
            $("#revert").click({initialFileContents: xmlHttpRequest.responseText}, revert)
        }
    });
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
    window.open(event.data.filePath + "?download", "_blank");
};

$(document).ready(function() {
    var x = document.getElementsByClassName('mdc-button');
    var i;
    for (i = 0; i < x.length; i++) {
        mdc.ripple.MDCRipple.attachTo(x[i]);
    }

    let pathSplit = filePath.split("/");
    $(".mdc-drawer__title").text(pathSplit[pathSplit.length - 1]);
    var supportedTypes = ["txt", "json", "log", "properties", "yml"];

    var fileEditor = $("#fileContents");
	//$("#file").text($("#file").text() + " " + filePath.substring("/files".length));

    if (supportedTypes.includes(filePath.split(".").pop())) {
        getFile(filePath);

        var firstRun = true;

        fileEditor.bind("DOMSubtreeModified", function() {
            if (firstRun) {
                firstRun = false;
				$("#revert").click({initialFileContents: fileEditor.text()}, revert);
			}
        });
        $("#save").click({filePath: filePath}, save);
		
    } else {
        $("#save").remove();
        $("#revert").remove();
        fileEditor.text("Can't open file type");
        fileEditor.prop("contenteditable", false);
    }

    $("#back").click(function() {
        window.open(location.pathname + "/..", "_self");
    });
    
    $("#download").click({filePath: filePath}, download);
});