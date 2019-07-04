$(document).ready(function() {

    var properties = $("#properties");
    var initialPropertiesDictionary = {};
    var propertiesDictionary = {};
    var initialMD5 = null;

    var getProperties = function() {
        getRequest("/files/server.properties", function(xmlHttpRequest) {
            if (xmlHttpRequest.status === 200) {
                var propertiesList = xmlHttpRequest.responseText.trim().split("\n");
                for (var line in propertiesList) {
                    var property = propertiesList[line];

                    if (!property.startsWith("#")) {
                        var lineSplit = property.split("=");
                        initialPropertiesDictionary[lineSplit[0]] = lineSplit[1];
                    }
                }

                for(var property in initialPropertiesDictionary) {
                    if (initialPropertiesDictionary.hasOwnProperty(property)) {
                        var value = initialPropertiesDictionary[property];
                        properties.append("<div class=\"mdc-text-field\" style='margin-right: 5px; margin-bottom: 5px;'> <input class=\"property mdc-text-field__input\" type=\"text\" autocomplete='off' autocapitalize=\"none\" name=\"" + property + "\" value=\"" + value + "\" autocomplete='off'> <div class=\"mdc-line-ripple\"></div> <label class=\"mdc-floating-label\">" + property + "</label></div>")
                    }
                }

                var x = document.getElementsByClassName('mdc-text-field');
                for (var i = 0; i < x.length; i++) {
                    new mdc.textField.MDCTextField(x[i]);
                }

                x = document.getElementsByClassName('mdc-button');
                for (var i = 0; i < x.length; i++) {
                    mdc.ripple.MDCRipple.attachTo(x[i]);
                }

            }
        });
    };

    var getInitialHash = function() {
        getRequest("/properties/hash", function(xmlHttpRequest) {
            if (xmlHttpRequest.status == 200) {
                initialMD5 = xmlHttpRequest.responseText;
            }
        });
    };

    getProperties();
    getInitialHash();

    var submit = function() {
        $(".property").each(function() {
            var property_input = $(this);

            try {
                var property_text = property_input.attr("name");

            } catch (TypeError) {
                return;
            }
            try {
                var property_input_text = property_input.val().trim();
            } catch (TypeError) {
                property_input_text = "";
            }

            if (initialPropertiesDictionary.hasOwnProperty(property_text)) {
                var initialProperty_input_text = initialPropertiesDictionary[property_text];
                if (initialProperty_input_text != property_input_text) {
                    propertiesDictionary[property_text] = property_input_text;
                    initialPropertiesDictionary[property_text] = property_input_text;
                }
            } else {
                propertiesDictionary[property_text] = property_input_text;
                initialPropertiesDictionary[property_text] = property_input_text;
            }
        });

        if (Object.keys(propertiesDictionary).length == 0) {
            showSnackbar(basicSnackbar, "No changes were made");
        } else {
            var post = "";
            for (var property in propertiesDictionary) {
                if (propertiesDictionary.hasOwnProperty(property)) {
                    var value = propertiesDictionary[property];
                    post += property + "=" + encodeURIComponent(value) + "&";
                }
            }
            post = post.substring(0, post.length - 1);
            postRequest("/properties/update", post, function(xmlHttpRequest) {
                showSnackbar(basicSnackbar, xmlHttpRequest.responseText);
                getInitialHash();
                if (xmlHttpRequest.status !== 200) {
                    properties.empty();
                    getProperties();
                }
            });
        }
    };

    var submitCheck = function() {
        getRequest("/properties/hash", function(xmlHttpRequest) {
            if (xmlHttpRequest.status == 200) {
                var md5 = xmlHttpRequest.responseText;
                if (xmlHttpRequest.responseURL.search("login") != -1) {
                    alert("You have been logged out");
                    window.location = "/logout";
                    return;
                }
                if (initialMD5 == md5) {
                    submit();
                } else {
                    if (confirm("Changes have been made since you entered this site.\nDo you want to override those changes?")) {
                        submit()
                    }
                }
            }
        });
    };

    $(document).keypress(function(e) {
        var key = e.which;
        if (key == 13) {
            submitCheck();
        }
    });

    $("#submit").click(submitCheck)
});