$(document).ready(function() {
    var x = document.getElementsByClassName('mdc-button');
    var i;
    for (i = 0; i < x.length; i++) {
        mdc.ripple.MDCRipple.attachTo(x[i]);
    }

    $("#folder").text(location.pathname);

    var files = $("#files");

    const filesPath = "/files";
    let currentPath = filesPath;
    let directoryPathSplit = directoryPath.substring(1).split("/");
    if (directoryPathSplit.length > 3) {
        $("#navigation-bar").append("<td><div style='margin-top: 10px' class=\"navigation-arrow material-icons\">chevron_right</div></td>");
        $("#navigation-bar").append("<td><button class='mdc-menu-surface--anchor' id='path-overflow-button' style='font-size: 15px; margin-top: 7px; margin-left: 5px; border: none; outline: none; background-color: transparent'><h4>...</h4><div id='path-overflow-menu' class=\"mdc-menu mdc-menu-surface\"> <ul id='path-overflow-list' class=\"mdc-list\" role=\"menu\" aria-hidden=\"true\" aria-orientation=\"vertical\" tabindex=\"-1\"> </ul> </div></button></td>");
        const pathOverflowMenu = new mdc.menu.MDCMenu(document.querySelector('#path-overflow-menu'));
        pathOverflowMenu.listen("MDCMenu:selected", function() {
            console.log(event.detail.index);
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
    for (var directoryIndex in directoryPathSplit) {
        var directory = directoryPathSplit[directoryIndex];
        currentPath += "/" + directory;
        if (directory.trim() === "") continue;
        if (directoryPathSplit.length > 3 && directoryIndex < directoryPathSplit.length - 2) {
            $("#path-overflow-list").append("<li class=\"mdc-list-item\" role=\"menuitem\"> <span class=\"mdc-list-item__text\">" + directory + "</span> </li>");
            continue;
        }
        $("#navigation-bar").append("<td><div style='margin-top: 10px' class=\"navigation-arrow material-icons\">chevron_right</div></td>");
        $("#navigation-bar").append("<td><button onclick=\"window.location.href = '" + currentPath + "';\"style='font-size: 15px; margin-top: 7px; margin-left: 5px; border: none; outline: none; background-color: transparent'><h4>" + directory + "</h4></button></td>");
    }
    for (var fileIndex in folderContents) {
        var file = folderContents[fileIndex];
        if (file.name == "..") {
            var backButton = $("#back");
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

        files.append("<tr class='underlinedTR file' id='" + file.name + "'><td><span class='file-icons material-icons'>" + icon + "</span></td><td><p>" + file.name + "</p></td><td><p>" + file.size.toUpperCase() + "</p></td><td><p>" + file.date + "</p></td></tr>");
    }

    $(".file").dblclick(function() {
        window.location = location.pathname + "/" + this.id;
    });

    $(document).click(function (e) {
        if (!$(".file").is(e.target) && $(".file").has(e.target).length === 0) {
            setTimeout(function() {
                $(".file").css("background-color", "")
            }, 0)

        }

    });

    $(".file").click(function() {
        $(".file").css("background-color", "");
        $(this).css("background-color", "#e6e6e6");
    });



    $("#back").click(function() {
        window.open(location.pathname + "/..", "_self");
    });

});

function deselectAll() {

}