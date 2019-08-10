let request = function(method, url, data, callback, authorization) {
    let xmlHttpRequest = new XMLHttpRequest();
    xmlHttpRequest.open(method, url);
	xmlHttpRequest.timeout = 10000;
    if (authorization != null) xmlHttpRequest.setRequestHeader("Authorization", authorization);
    xmlHttpRequest.onreadystatechange = function () {
        if (xmlHttpRequest.readyState === XMLHttpRequest.DONE) {
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

let getRequest = function(url, callback, authorization) {
    request("GET", url, null, callback, authorization);
};

let postRequest = function(url, data, callback, authorization) {
    request("POST", url, data, callback, authorization);
};

function getQueryVariable(variable) {
    let query = window.location.search.substring(1);
    let vars = query.split('&');
    for (let i = 0; i < vars.length; i++) {
        let pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) === variable) {
            return decodeURIComponent(pair[1]);
        }
    }
    return null;
}