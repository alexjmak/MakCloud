const archiver = require('archiver');
const fs = require("fs");
const path = require("path");
const stream = require("stream");
const preferences = require("./preferences");
const log = require("./core/log");

let createFolderArchive = function(directory, filePath, owner, next) {
    let folderPath = path.join(preferences.get("files"), owner.toString(), directory, filePath);
    let archive = archiver('zip');
    archive.on('error', function(err) {
        log.write(err);
    });

    archive.directory(folderPath, false);
    archive.finalize();
    next(archive);
};

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

let readDirectory = function(directory, callback, next) {
    fs.readdir(directory, function(err, files) {
        if (err) {
            log.write(err);
            if (next) next(err);
            return;
        }
        function nextFile(i) {
            if (files.hasOwnProperty(i)) {
                let file = files[i];
                let filePath = path.join(directory, file);
                fs.stat(filePath, function(err, stats) {
                    callback(filePath, stats.isDirectory(), function() {
                        nextFile(i + 1);
                    });
                });
            } else {
                next();
            }
        }
        nextFile(0);
    });

}
let readFile = function(filePath, key, iv, next) {
    let readStream = fs.createReadStream(filePath);
    readStream.on("error", function(err) {
        log.write(err);
    });
    if (key && iv) {
        const encryptionManager = require("./encryptionManager");
        encryptionManager.isEncrypted(fs.createReadStream(filePath), key, iv, function(encrypted) {
            if (encrypted) {
                encryptionManager.decryptStream(readStream, key, iv, function(decryptedStream) {
                    next(decryptedStream);
                });
            } else {
                log.write("Sending raw file...");
                next(fs.createReadStream(filePath));
            }
        })
    } else {
        if (next !== undefined) next(readStream);
    }
};

let walkDirectory = function(directory, callback, next) {
    readDirectory(directory, function(filePath, isDirectory, next) {
        callback(filePath, isDirectory, function(newFilePath) {
            if (!newFilePath) newFilePath = filePath;
            if (isDirectory) {
                walkDirectory(newFilePath, callback, function() {
                    if (next) next();
                });
            } else {
                if (next) next();
            }
        });
    }, next);
};


let writeFile = function(filePath, contentStream, key, iv, next) {
    if (key && iv) {
        const encryptionManager = require("./encryptionManager");
        encryptionManager.encryptFilePath(filePath, key, iv, function(encryptedFilePath) {
            if (!encryptedFilePath) encryptedFilePath = filePath;
            let writeStream = fs.createWriteStream(encryptedFilePath);
            encryptionManager.encryptStream(contentStream, key, iv, function(encryptedStream) {
                if (encryptedStream) {
                    encryptedStream.pipe(writeStream);
                    encryptedStream.on("error", function(err) {
                        log.write(err);
                        if (next) next(err);
                    });
                    writeStream.on("close", function () {
                        if (next) next();
                    })
                } else {
                    let err = "Couldn't encrypt file";
                    log.write(err);
                    if (next) next(err);
                }
            });
        })


    } else {
        let writeStream = fs.createWriteStream(filePath);
        contentStream.pipe(writeStream)
        contentStream.on("error", function(err) {
            log.write(err);
            if (next) next(err);
        });
        writeStream.on("close", function () {
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

module.exports = {
    createFolderArchive: createFolderArchive,
    deleteFile: deleteFile,
    readDirectory: readDirectory,
    readFile: readFile,
    walkDirectory: walkDirectory,
    writeFile: writeFile,
    writeFiles: writeFiles,
};