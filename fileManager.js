const archiver = require('archiver');
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const preferences = require("./preferences");
const encryptionManager = require("./encryptionManager");
const log = require("./log");

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
                        log.write(err);
                        if (next !== undefined) next(false);
                    } else {
                        if (next !== undefined) next(true);
                    }
                });
            } else {
                log.write(err);
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
    fileOutput.on('error', function(err) {
        log.write(err);
    });
    fileOutput.on('close', function () {
        if (next !== undefined) next(path.resolve(outputPath))
    });

    let archive = archiver('zip');
    archive.on('error', function(err) {
        log.write(err);
    });
    archive.pipe(fileOutput);
    archive.directory(folderPath, false);
    archive.finalize();
};

let readFile = function(filePath, key, iv, next) {
    if (key && iv) {
        let fileStream = fs.createReadStream(filePath);
        encryptionManager.decryptStream(fileStream, key, iv, function(decryptedStream) {
            let bufferArray = [];
            decryptedStream.on('error', function(err) {
                log.write("Sending raw file...");
                fs.readFile(filePath, function (err, contents) {
                    if (next !== undefined) next(contents);
                });
            });
            decryptedStream.on('data', function(data) {
                bufferArray.push(data);
            });
            decryptedStream.on('end', function() {
                let buffer = Buffer.concat(bufferArray);
                if (next !== undefined) next(buffer);
            });
        });


    } else {
        fs.readFile(filePath, function (err, contents) {
            if (next !== undefined) next(contents);
        });
    }

};

let writeFiles = function(files, saveDirectory, key, iv, next) {
    if (!files || Object.keys(files).length === 0) {
        if (next !== undefined) return next(false);
    }

    let returnErr;

    for (let file in files) {
        if (!files.hasOwnProperty(file)) continue;
        file = files[file];
        let saveLocation = path.join(saveDirectory, file.name);

        if (key && iv) {
            encryptionManager.encryptBuffer(file.data, key, iv, function(encryptedStream) {
                encryptedStream = encryptedStream.pipe(fs.createWriteStream(saveLocation));
                encryptedStream.on("error", function(err) {
                    if (err && returnErr === undefined) returnErr = err;
                });
            });
        } else {
            fs.writeFile(saveLocation, file.data, function(err) {
                if (err && returnErr === undefined) returnErr = err;
            });
        }
    }
    if (next !== undefined) return next(returnErr);
};


module.exports = {deleteFile: deleteFile,
                  createFolderArchive: createFolderArchive,
                  readFile: readFile,
                  writeFiles: writeFiles};