const archiver = require('archiver');
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const stream = require("stream");
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
    let readStream = fs.createReadStream(filePath);
    readStream.on("error", function(err) {
        log.write(err);
    });
    if (key && iv) {
        encryptionManager.decryptStream(readStream, key, iv, function(decryptedStream) {
            let nextCalled = false;
            decryptedStream.on("error", function() {
                log.write("Sending raw file...");
                if (next && !nextCalled) {
                    nextCalled = true;
                    next(fs.createReadStream(filePath));
                }
            })
            decryptedStream.on("finish", function() {
                if (next && !nextCalled) {
                    nextCalled = true;
                    next(decryptedStream);
                }
            })
        });
    } else {
        if (next !== undefined) next(readStream);
    }
};

let writeFile = function(filePath, contentStream, key, iv, next) {
    if (key && iv) {
        encryptionManager.encryptStream(contentStream, key, iv, function(encryptedStream) {
            encryptedStream = encryptedStream.pipe(fs.createWriteStream(filePath));
            encryptedStream.on("error", function(err) {
                log.write(err);
            });
            encryptedStream.on("close", function () {
                if (next) next();
            })
        });
    } else {
        contentStream.pipe(fs.createWriteStream(filePath))
        contentStream.on("error", function(err) {
            log.write(err);
        });
        contentStream.on("close", function () {
            if (next) next();
        })
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

        let contentStream = new stream.PassThrough();
        contentStream.end(file.data)

        writeFile(saveLocation, contentStream, key, iv, function(err) {
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