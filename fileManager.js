const archiver = require('archiver');
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const preferences = require("./preferences");
const encryptionManager = require("./encryptionManager");
const log = require("./log");

let deleteFile = function(directory, filePath, owner, next) {
    let realFilePath = path.join(preferences.get("files"), owner.toString(), directory, filePath);
    let deleteFilePath = path.join(preferences.get("files"), owner.toString(), directory, ".recycle", filePath);
    let deleteFilePathParent = path.parse(deleteFilePath).dir;

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
    let folderPath = path.join(preferences.get("files"), owner.toString(), directory, filePath);
    let outputArchiveName = "download-" + crypto.randomBytes(4).toString("hex") + ".zip";
    let outputPath = path.join(preferences.get("files"), owner.toString(), outputArchiveName);

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
        encryptionManager.decryptStream(fileStream, key, iv, function(err, buffer) {
            if (err) {
                log.write("Sending raw file...");
                fs.readFile(filePath, function (err, contents) {
                    if (next !== undefined) next(contents);
                });
            } else {
                if (next !== undefined) next(buffer);
            }
        });
    } else {
        fs.readFile(filePath, function (err, contents) {
            if (next !== undefined) next(contents);
        });
    }
};

let writeFile = function(filePath, data, key, iv, next) {
    if (key && iv) {
        encryptionManager.encryptBuffer(data, key, iv, function(encryptedStream) {
            encryptedStream = encryptedStream.pipe(fs.createWriteStream(filePath));
            encryptedStream.on("error", function(err) {
                if (err && next) next(err);
            });
            encryptedStream.on("finish", function () {
                if (next) next();
            })
        });
    } else {
        fs.writeFile(filePath, data, function(err) {
            if (err) {
                if (next) next(err);
            } else {
                if (next) next();
            }
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

        writeFile(saveLocation, file.data, key, iv, function(err) {
            if (err && returnErr === undefined) returnErr = err;
        })
    }
    if (next !== undefined) return next(returnErr);
};

let walkDirectory = function(dir, callback, next) {
    let files = fs.readdirSync(dir);
    for (let file in files) {
        if (!files.hasOwnProperty(file)) continue;
        file = files[file];
        let dirPath = path.join(dir, file);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDirectory(dirPath, callback, undefined) : callback(path.join(dir, file));
    }
    if (next) next();
};

module.exports = {deleteFile: deleteFile,
                  createFolderArchive: createFolderArchive,
                  readFile: readFile,
                  writeFile: writeFile,
                  writeFiles: writeFiles,
                  walkDirectory: walkDirectory};