var request = function(method, url, data, callback, authorization) {
    var xmlHttpRequest = new XMLHttpRequest();
    xmlHttpRequest.open(method, url);
	xmlHttpRequest.timeout = 10000
    if (authorization != null) xmlHttpRequest.setRequestHeader("Authorization", authorization);
    xmlHttpRequest.onreadystatechange = function () {
        if (xmlHttpRequest.readyState == XMLHttpRequest.DONE) {
            callback(xmlHttpRequest);
        }
    };

    if (data == null) {
        xmlHttpRequest.send();
    } else {
        xmlHttpRequest.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        xmlHttpRequest.send(data);
    }
};

var getRequest = function(url, callback, authorization) {
    request("GET", url, null, callback, authorization);
};

var postRequest = function(url, data, callback, authorization) {
    request("POST", url, data, callback, authorization);
};

function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1]);
        }
    }
    return null;
}