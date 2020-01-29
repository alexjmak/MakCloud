$(document).ready(function() {
    let files = $("#files");

    let filesPath = location.pathname.substring(1);
    filesPath = filesPath.split("/");

    if (filesPath[0] === "shared") filesPath = filesPath.slice(0, 2).join("/");
    else filesPath = filesPath[0];

    filesPath = "/" + filesPath;

    let folderName = directoryPath.split("/").pop();
    if (folderName === "") folderName = "My Files";
    $(".mdc-drawer__title").text(folderName);

    let currentPath = filesPath;

    let selectedItem;

    if (directoryPath.startsWith("/")) directoryPath = directoryPath.substring(1);
    let directoryPathSplit = directoryPath.split("/");
    if (directoryPathSplit.length === 1 && directoryPathSplit[0] === "") {
        $("#back").hide();
    }

    if (directoryPathSplit.length > 3) {
        $("#navigation-bar").append("<td><div style='margin-top: 10px' class=\"navigation-arrow material-icons\">chevron_right</div></td>");
        $("#navigation-bar").append("<td><button class='mdc-menu-surface--anchor' id='path-overflow-button' style='font-size: 15px; margin-top: 7px; margin-left: 5px; border: none; outline: none; background-color: transparent'><h4>...</h4><div id='path-overflow-menu' class=\"mdc-menu mdc-menu-surface\"> <ul id='path-overflow-list' class=\"mdc-list\" role=\"menu\" aria-hidden=\"true\" aria-orientation=\"vertical\" tabindex=\"-1\"> </ul> </div></button></td>");
        const pathOverflowMenu = new mdc.menu.MDCMenu(document.querySelector('#path-overflow-menu'));
        pathOverflowMenu.listen("MDCMenu:selected", function() {
            let currentPath = filesPath;

            for (let i = 0; i <= event.detail.index; i++) {
                currentPath += "/" + directoryPathSplit[i];
            }

            window.location.href = currentPath;
        });

        $("#path-overflow-button").click(function() {
            pathOverflowMenu.open = true;
        });
    }

    for (let directoryIndex in directoryPathSplit) {
        let directory = directoryPathSplit[directoryIndex];
        currentPath += "/" + directory;
        if (directory.trim() === "") continue;
        if (directoryPathSplit.length > 3 && directoryIndex < directoryPathSplit.length - 2) {
            $("#path-overflow-list").append("<li class=\"mdc-list-item\" role=\"menuitem\"> <span class=\"mdc-list-item__text\">" + directory + "</span> </li>");
            continue;
        }
        $("#navigation-bar").append("<td><div style='margin-top: 10px' class=\"navigation-arrow material-icons\">chevron_right</div></td>");
        $("#navigation-bar").append("<td><button onclick=\"window.location.href = '" + currentPath + "';\"style='font-size: 16px; margin-top: 7px; margin-left: 5px; border: none; outline: none; background-color: transparent'><h4>" + directory + "</h4></button></td>");
    }

    $("#navigation-bar").append("<td hidden id='actionButtons' style='position: absolute; right: 7px;'><button id='download' class=\"mdc-icon-button material-icons\">cloud_download</button><button id='share' class=\"mdc-icon-button material-icons\">share</button><button id='delete' class=\"mdc-icon-button material-icons\">delete</button></td>");

    let iconButtons = document.getElementsByClassName('mdc-icon-button');
    for (let i = 0; i < iconButtons.length; i++) {
        new mdc.ripple.MDCRipple(iconButtons[i]).unbounded = true;
    }

    for (let fileIndex in folderContents) {
        if (folderContents.hasOwnProperty(fileIndex)) {
            let file = folderContents[fileIndex];
            if (file.name === ".recycle") {
                folderContents.splice(fileIndex, 1);
            }
        }
    }

    for (let fileIndex in folderContents) {
        if (folderContents.hasOwnProperty(fileIndex)) {
            let file = folderContents[fileIndex];
            if (file.name === "..") {
                let backButton = $("#back");
                backButton.click(function() {
                    window.open(location.pathname + "/..", "_self");
                });
                backButton.prop("hidden", false);
                continue;
            }

            file.size = file.size.replace(".00", "");
            file.date = file.date.split(".");
            let month = file.date[0];
            file.date[0] = file.date[1];
            file.date[1] = month;
            file.date = file.date.join("/");
            let icon = "subject";
            if (file.type === "directory") {
                file.size = "----";
                icon = "folder";
            }

            files.append("<tr class='underlinedTR file' id='" + fileIndex + "' name='" + file.name + "'><td><span class='file-icons material-icons'>" + icon + "</span></td><td><p>" + file.name + "</p></td><td><p>" + file.size.toUpperCase() + "</p></td><td><p>" + file.date + "</p></td></tr>");
        }
    }

    $(".file").click(function() {
        fileClick(this);
    });

    $(".file").dblclick(function() {
        fileDblClick(this)
    });

    $(document).keydown(function(e) {
        switch (e.keyCode) {
            case 38:
                $(".file").css("background-color", "");
                if (selectedItem === undefined) {
                    $(".file").eq(0).css("background-color", "#e6e6e6");
                    selectedItem = $(".file").get(0);
                    $("#actionButtons").show()
                } else {
                    $(".file").eq((parseInt(selectedItem.id) - 1) % $(".file").length).css("background-color", "#e6e6e6");
                    selectedItem = $(".file").get((parseInt(selectedItem.id) - 1) % $(".file").length);

                }
                break;

            case 40:
                $(".file").css("background-color", "");
                if (selectedItem === undefined) {
                    $(".file").eq(0).css("background-color", "#e6e6e6");
                    selectedItem = $(".file").get(0);
                    $("#actionButtons").show()
                } else {
                    $(".file").eq((parseInt(selectedItem.id) + 1) % $(".file").length).css("background-color", "#e6e6e6");
                    selectedItem = $(".file").get((parseInt(selectedItem.id) + 1) % $(".file").length);
                }
                break;
        }
    });

    $(document).keypress(function(e) {
        switch (e.which) {
            case 13:
                window.location = [location.pathname, $(selectedItem).attr("name")].join("/");
                break;
        }
    });

    $(document).click(function (e) {

        if (!$(".file").is(e.target) && $(".file").has(e.target).length === 0) {

            setTimeout(function() {
                selectedItem = undefined;
                $(".file").css("background-color", "");
                $("#actionButtons").hide()
            }, 0);
        }
    });


    $("#download").click(function () {
        let fileName = $(selectedItem).attr("name");
        window.open([location.pathname, fileName].join("/") + "?download", "_blank");
    });

    $("#delete").click(function () {

        let fileName = $(selectedItem).attr("name");
        let fileId = $(selectedItem).attr("id");
        showDialog(yesNoDialog, "MakCloud", "Are you sure you want to delete " + fileName  + "?", {"yes": function() {
            deleteRequest([location.pathname, fileName].join("/"), function(xmlHttpRequest) {
                    if (xmlHttpRequest.status === 200)  {
                        folderContents.splice(fileId, 1);
                        reload();
                        showSnackbar(basicSnackbar, "Deleted " + fileName)
                    } else {
                        showSnackbar(basicSnackbar, "Error deleting " + fileName)
                    }
                });
            }});
    });


    $("#share").click(function () {
        share({"data": {"filePath": [location.pathname, $(selectedItem).attr("name")].join("/")}});
    });

    $("#upload").click(function() {
        $("#uploadButton").trigger("click");
    });

    $("#back").click(function() {
        window.open(location.pathname + "/..", "_self");
    });

    $("#logout").click(function() {
        $.removeCookie("fileToken", { path: location.pathname.split("/").slice(0, 4).join("/") });
        window.location.href = "/logout";
    });

    function fileClick(file) {
        $(".file").css("background-color", "");
        $(file).css("background-color", "#e6e6e6");
        $("#actionButtons").show();
        selectedItem = file;
    }

    function fileDblClick(file) {
        window.location = [location.pathname, $(file).attr("name")].join("/");
    }


    function reload() {
        $(".file").remove();

        for (let fileIndex in folderContents) {
            if (folderContents.hasOwnProperty(fileIndex)) {
                let file = folderContents[fileIndex];

                let icon = "subject";
                if (file.type === "directory") {
                    file.size = "----";
                    icon = "folder";
                }

                files.append("<tr class='underlinedTR file' id='" + fileIndex + "' name='" + file.name + "'><td><span class='file-icons material-icons'>" + icon + "</span></td><td><p>" + file.name + "</p></td><td><p>" + file.size.toUpperCase() + "</p></td><td><p>" + file.date + "</p></td></tr>");
            }
        }

        $(".file").click(function() {
            fileClick(this);
        });
        $(".file").dblclick(function() {
            fileDblClick(this)
        });
    }

});




function deselectAll() {

}