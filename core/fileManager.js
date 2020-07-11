const archiver = require('archiver');
const fs = require("fs");
const mkdirp = require("mkdirp")
const multer = require("multer")
const multerStorage = require('../modules/multer/StorageEngine');
const path = require("path");
const tmp = require('tmp');
const preferences = require("../preferences");
const log = require("./log");

let createArchive = function(directories, next) {
    initArchive(function(archive) {
        if (typeof directories === "string") directories = [directories];
        function callback(i) {
            if (directories.hasOwnProperty(i)) {
                walkDirectory(directories[i], function(filePath, isDirectory, next) {
                    if (isDirectory) return next();
                    readFile(filePath, function(readStream) {
                        let name = path.relative(path.dirname(directories[i]), filePath);
                        archive.append(readStream, { name: name});
                        return next();
                    })
                }, function() {
                    callback(i + 1);
                });
            } else {
                archive.finalize();
                next(archive);
            }
        }
        callback(0);
    });
}

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

let initArchive = function(next) {
    let archive = archiver('zip');
    archive.on('error', function(err) {
        log.write(err);
    });
    if (next) next(archive);
}

let processUpload = function(saveLocation) {
    return function(req, res, next) {
        let uploadFile = function(file, next) {
            let filePath = path.join(saveLocation, file.originalname);
            writeFile(filePath, file.stream, next);
        }
        return multer({storage: multerStorage(uploadFile)}).any()(req, res, function(err) {
            if (err) return res.status(500).send("Upload failed");
            if (Object.keys(req.files).length === 1) res.send("Uploaded file");
            else res.send("Uploaded files");
        });
    }
}

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
let readFile = function(filePath, next) {
    let readStream = fs.createReadStream(filePath);
    readStream.on("error", function(err) {
        log.write(err);
    });
    if (next) next(readStream);
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


let writeFile = function(filePath, contentStream, next) {
    newTmpFile(function(err, tmpFilePath) {
        if (err) {
            if (next) next(err);
            return;
        }
        let writeStream = fs.createWriteStream(tmpFilePath);
        contentStream.pipe(writeStream)
        contentStream.on("error", function(err) {
            log.write(err);
            fs.unlink(tmpFilePath, function() {
                if (next) next(err);
            })
        });
        writeStream.on("close", function () {
            fs.rename(tmpFilePath, filePath, function(err) {
                next(err);
            });
        });

    })

};

let newTmpFile = function(next) {
    let tmpdir = path.join(preferences.get("files"), "tmp")
    mkdirp(tmpdir).then(function() {
        tmp.tmpName({ tmpdir: tmpdir }, function(err, tmpPath) {
            if (err) {
                log.write(err);
            }
            if (next) next(err, tmpPath);
        });
    })
}

module.exports = {
    createArchive: createArchive,
    deleteFile: deleteFile,
    initArchive: initArchive,
    processUpload: processUpload,
    readDirectory: readDirectory,
    readFile: readFile,
    walkDirectory: walkDirectory,
    writeFile: writeFile,
};