$(document).ready(function() {
    let console = $("#console");
    let log = $("#console_text");
    let oldLogText = true;
    let oldSize = 0;
    let scrollDifference = console[0].scrollHeight - console.scrollTop();

    let noConnDialog;

    let getLogHash = function(automatic) {
        getRequest("/log/size", function(xmlHttpRequest) {
            if (xmlHttpRequest.status === 200) {
                if (noConnDialog !== undefined && noConnDialog.isOpen) noConnDialog.close();
                let size = parseInt(xmlHttpRequest.responseText);
                if (new URL(xmlHttpRequest.responseURL).pathname === "/login") {
                    automatic = false;
                    showDialog(okDialog, locale.app_name, locale.session_expired, {
                        "close": function () {
                            location.reload()
                        }
                    });
                } else if (oldSize !== size) {
                    if (size > oldSize) getLog(oldSize);
                    else getLog();
                    oldSize = size;
                }
            } else if (xmlHttpRequest.status === 0 && (noConnDialog === undefined || !noConnDialog.isOpen)) {
                try {
                    noConnDialog = showDialog(okDialog, locale.app_name, locale.no_connection, {
                        "close": function () {
                            getLogHash(false);
                        }
                    });
                    noConnDialog.buttons_[0].firstChild.innerHTML = locale.retry;
                    noConnDialog.escapeKeyAction = "";
                    noConnDialog.scrimClickAction = "";
                } catch (err) {
                }

            } else if (xmlHttpRequest.status === 403) {
                location.reload();
            }
            if (automatic) {
                window.setTimeout(getLogHash, 5000, true);
            }
        });
    };

    let getLog = function(start) {
        if (!start) {
            start = 0;
            log.text("");
        }

        getRequest("/log/raw?start=" + start, function(xmlHttpRequest) {
            if (xmlHttpRequest.status === 200) {
                let logText = xmlHttpRequest.responseText;
                log.append(logText);
                if (oldLogText !== logText) {
                    oldLogText = logText;
                    if ((console[0].scrollHeight - console.scrollTop()) < scrollDifference + 130) {
                        console.scrollTop(console[0].scrollHeight);
                    } else {
                        console.scrollTop(console.animate({
                            scrollTop: console[0].scrollHeight}, 'slow'));
                    }
                }
            }
        });
    };
    getLogHash(true);
});