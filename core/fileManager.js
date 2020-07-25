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
                walkDirectoryPreorder(directories[i], function(filePath, isDirectory, next) {
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

let deleteFile = function(filePath, relativeDirectory, next) {
    let recycleDirectory = path.join(relativeDirectory, ".recycle");
    let deletedPath = path.join(recycleDirectory, path.relative(relativeDirectory, filePath))

    fs.stat(filePath, function(err, stats) {
        if (!err) {
            if (filePath.startsWith(recycleDirectory)) {
                fs.unlink(filePath, function(err) {
                    if (err) {
                        log.write(err);
                        if (next !== undefined) next(false);
                    } else {
                        if (next !== undefined) next(true);
                    }
                })
            } else {
                mkdirp(path.dirname(deletedPath)).then(function() {
                    fs.rename(filePath, deletedPath, function (err) {
                        if (err) {
                            log.write(err);
                            if (next !== undefined) next(false);
                        } else {
                            if (next !== undefined) next(true);
                        }
                    });
                }).catch(function(err) {
                    log.write(err);
                    if (next) next(false);
                });
            }
        } else {
            log.write(err);
            if (next) next(false);
        }
    });
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
                    if (err) {
                        log.write(err);
                        return nextFile(i + 1);
                    }
                    callback(filePath, stats.isDirectory(), function() {
                        nextFile(i + 1);
                    });
                });
            } else {
                if (next) next();
            }
        }
        nextFile(0);
    });

}
let readFile = function(filePath, next, options) {
    let readStream = fs.createReadStream(filePath, options);
    readStream.on("error", function(err) {
        log.write(err);
    });
    if (next) next(readStream);
};

let walkDirectoryPreorder = function(directory, callback, next) {
    readDirectory(directory, function(filePath, isDirectory, next) {
        callback(filePath, isDirectory, function(newDirectoryName) {
            if (isDirectory) {
                if (newDirectoryName) filePath = newDirectoryName;
                walkDirectoryPreorder(filePath, callback, function() {
                    if (next) next();
                });
            } else {
                if (next) next();
            }
        });
    }, next);
};

let walkDirectoryPostorder = function(directory, callback, next) {
    readDirectory(directory, function(filePath, isDirectory, next) {
        if (isDirectory) {
            walkDirectoryPostorder(filePath, callback, function() {
                callback(filePath, isDirectory, function() {
                    if (next) next();
                });
            });
        } else {
            callback(filePath, isDirectory, function() {
                if (next) next();
            });
        }
    }, next);
};

let writeFile = function(filePath, contentStream, next, prependBuffer) {
    newTmpFile(function(err, tmpFilePath) {
        if (err) {
            if (next) next(err);
            return;
        }
        let writeStream = fs.createWriteStream(tmpFilePath);

        if (prependBuffer) {
            for (let buffer of prependBuffer) {
                writeStream.write(buffer);
            }
        }

        contentStream.on("data", function(data) {
            writeStream.write(data);
        })

        contentStream.on("end", function() {
            writeStream.close();
        })

        contentStream.on("error", function(err) {
            log.write(err);
            fs.unlink(tmpFilePath, function() {
                if (next) next(err);
            })
        });

        writeStream.on("close", function () {
            console.log(err);
            mkdirp(path.dirname(filePath)).then(function() {
                fs.stat(filePath, function(err, stat) {

                    if (err) {
                        fs.rename(tmpFilePath, filePath, function(err) {
                            if (next) next(err);
                        });
                    } else {
                        findSimilarName(filePath).then(function(newFilePath) {
                            fs.rename(tmpFilePath, newFilePath, function(err) {
                                if (next) next(err);
                            });
                        })
                    }
                })

            })

        });

    })

};

let findSimilarName = function(filePath) {
    return new Promise((resolve, reject) => {
        let findSimilarNameUtil = function(counter) {
            let parent = path.dirname(filePath);
            let fileNameSplit = path.basename(filePath).split(".");
            let extension = fileNameSplit.pop();
            let fileName = fileNameSplit.join(".");
            let newFilePath = path.join(parent, `${fileName}-${counter}.${extension}`);
            fs.stat(newFilePath, function(err, stats) {
                if (err) {
                    resolve(newFilePath);
                } else {
                    findSimilarNameUtil(counter + 1)
                }
            })
        }
        findSimilarNameUtil(2);
    })
}

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
    walkDirectoryPreorder: walkDirectoryPreorder,
    walkDirectoryPostorder: walkDirectoryPostorder,
    writeFile: writeFile,
};