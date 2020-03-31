const archiver = require('archiver');
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const preferences = require("./preferences");

let deleteFile = function(directory, filePath, owner, next) {
    let realFilePath = path.join(preferences.get()["files"], owner.toString(), directory, filePath);
    let deleteFilePath = path.join(preferences.get()["files"], owner.toString(), directory, ".recycle", filePath);
    let deleteFilePathParent = deleteFilePath.split("/");
    deleteFilePathParent.pop();
    deleteFilePathParent = deleteFilePathParent.join("/");

    if (fs.existsSync(realFilePath)) {
        fs.mkdir(deleteFilePathParent, {recursive: true }, function(err) {
            if (!err) {
                fs.rename(realFilePath, deleteFilePath, function (err) {
                    if (err) {
                        console.log(err);
                        if (next !== undefined) next(false);
                    } else {
                        if (next !== undefined) next(true);
                    }
                });
            } else {
                console.log(err);
                if (next !== undefined) next(false);
            }
        });
    } else {
        if (next !== undefined) next(false);
    }
};

let createFolderArchive = function(directory, filePath, owner, next) {
    let folderPath = path.join(preferences.get()["files"], owner.toString(), directory, filePath);
    let outputArchiveName = "download-" + crypto.randomBytes(4).toString("hex") + ".zip";
    let outputPath = path.join(preferences.get()["files"], owner.toString(), outputArchiveName);

    let fileOutput = fs.createWriteStream(outputPath);
    fileOutput.on('close', function () {
        if (next !== undefined) next(path.resolve(outputPath))
    });

    let archive = archiver('zip');
    archive.on('error', function(err) {
        console.log(err);
    });
    archive.pipe(fileOutput);
    archive.directory(folderPath, false);
    archive.finalize();
};

let uploadFiles = function(files, saveLocation, next) {
    if (!files || Object.keys(files).length === 0) {
        if (next !== undefined) return next(false);
    }
    for (let file in files) {
        if (!files.hasOwnProperty(file)) continue;
        file = files[file];
        saveLocation = path.join(saveLocation, file.name);
        file.mv(saveLocation, function(err) {
            if (next !== undefined) return next(err);
        });
    }
};

module.exports = {deleteFile: deleteFile,
                  createFolderArchive: createFolderArchive,
                  uploadFiles: uploadFiles};