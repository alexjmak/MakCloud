const fs = require("fs");
const mime = require("mime");
const multer = require("multer")
const multerStorage = require('./modules/multer/StorageEngine');
const path = require("path");
const log = require("./core/log");
const readify = require("readify");
const accountManager = require("./accountManager")
const authorization = require("./authorization")
const createError = require("http-errors");
const fileManager = require("./core/fileManager");
const render = require("./core/render");

let createArchive = function(directories, key, next) {
    if (key) {
        fileManager.initArchive(function(archive) {
            if (typeof directories === "string") directories = [directories];
            function callback(i) {
                if (directories.hasOwnProperty(i)) {
                    fileManager.walkDirectoryPreorder(directories[i], function(filePath, isDirectory, next) {
                        if (isDirectory) return next();
                        if (key && path.basename(filePath) === "iv") return next();
                        readFile(filePath, key, function(readStream, decryptedFilePath) {
                            let name = path.relative(path.dirname(directories[i]), decryptedFilePath);
                            archive.append(readStream, { name: name});
                            return next();
                        });
                    }, function() {
                        callback(i + 1);
                    });
                } else {
                    archive.finalize();
                    next(archive);
                }
            }
            callback(0);
        })
    } else {
        fileManager.createArchive(directories, next);
    }
}


let downloadFile = function(filePath, key, req, res, next) {
    readFile(filePath, key, function(contentStream, decryptedFileName) {
        let header = {"Content-Type": "application/octet-stream", "Content-Disposition" : "attachment"};
        if (decryptedFileName) {
            header["Content-Disposition"] += `; filename="${encodeURIComponent(path.basename(decryptedFileName))}"`;
        }
        res.writeHead(200, header);
        contentStream.pipe(res);
    });
}

let downloadFolder = function(directory, name, key, req, res, next) {
    createArchive(directory, key, function(contentStream) {
        if (!name) name = "download-" + (Date.now() / 1000);
        let fileName = path.basename(name + ".zip");
        res.writeHead(200, {"Content-Type": "application/octet-stream", "Content-Disposition" : "attachment; filename=" + fileName});
        contentStream.pipe(res);
    });
}

let inlineFile = function(filePath, key, req, res, next) {
    readFile(filePath, key, function(contentStream, decryptedFilePath) {
        if (!decryptedFilePath) decryptedFilePath = filePath;
        let decryptedFileName = path.basename(decryptedFilePath);
        let header = {"Content-Type": "application/octet-stream", "Content-Disposition" : "inline", "Content-Type": mime.getType(decryptedFileName)};
        if (decryptedFileName) {
            header["Content-Disposition"] += `; filename="${encodeURIComponent(path.basename(decryptedFileName))}"`;
        }
        res.writeHead(200, header);
        contentStream.pipe(res);
    });
}

let processUpload = function(saveLocation, key) {
    return function(req, res, next) {
        let uploadFile = function(file, next) {
            let filePath = path.join(saveLocation, file.originalname);
            writeFile(filePath, file.stream, key, next);
        }
        return multer({storage: multerStorage(uploadFile)}).any()(req, res, function(err) {
            if (err) return res.status(500).send("Upload failed");
            if (Object.keys(req.files).length === 1) res.send("Uploaded file");
            else res.send("Uploaded files");
        });
    }
}

let renameDecryptDirectory = function (filePath, key, next) {
    const encryptionManager = require("./encryptionManager");
    fs.stat(filePath, function(err, stats) {
        if (!stats.isDirectory()) err = "Not a directory";
        if (err) {
            log.write(err);
            if (next) next(err);
            return;
        }
        encryptionManager.decryptFileName(filePath, key, function(decryptedFilePath) {
            if (!decryptedFilePath) decryptedFilePath = filePath;
            fs.rename(filePath, decryptedFilePath, function (err) {
                if (err) {
                    decryptedFilePath = filePath;
                    log.write(err);
                    if (next) next(decryptedFilePath);
                } else {
                    let ivFile = path.join(decryptedFilePath, "iv");
                    fs.unlink(ivFile, function() {
                        if (next) next(decryptedFilePath);
                    })
                }
            });
        });
    });


}


let renameEncryptDirectory = function (filePath, key, next) {
    const encryptionManager = require("./encryptionManager");
    fs.stat(filePath, function(err, stats) {
        if (!stats.isDirectory()) err = "Not a directory";
        if (err) {
            log.write(err);
            if (next) next(err);
            return;
        }
        let ivFile = path.join(filePath, "iv");
        let iv = encryptionManager.generateIV();
        fs.writeFile(ivFile, iv, function(err) {
            if (err) {
                log.write(err);
                if (next) next(err);
                return;
            }
            encryptionManager.encryptFileName(filePath, key, iv, function(encryptedFilePath) {
                if (!encryptedFilePath) encryptedFilePath = filePath;
                fs.stat(encryptedFilePath, function(err) {
                    if (!err && encryptedFilePath !== filePath) { //File exists and its encrypted
                        log.write("File name collision. Trying another iv...");
                        return renameEncryptDirectory(filePath, key, next);
                    }
                    fs.rename(filePath, encryptedFilePath, function (err) {
                        if (err) {
                            encryptedFilePath = filePath;
                            log.write(err);
                        }
                        if (next) next(encryptedFilePath);
                    });
                });
            });
        })


    });

}

let readFile = function(filePath, key, next) {
    if (key) {
        const encryptionManager = require("./encryptionManager");
        encryptionManager.getIVs(filePath, function(nameIV, contentIV) {
            encryptionManager.decryptFilePath(filePath, key, function(decryptedFilePath) {
                if (!decryptedFilePath) decryptedFilePath = filePath;
                encryptionManager.isEncrypted(fs.createReadStream(filePath, {start: 32}), key, contentIV, function(encrypted) {
                    if (encrypted) {
                        encryptionManager.decryptStream(fs.createReadStream(filePath, {start: 32}), key, contentIV, function(decryptedStream) {
                            next(decryptedStream, decryptedFilePath);
                        });
                    } else {
                        log.write("Sending raw file...");
                        fileManager.readFile(filePath, next);
                    }
                })
            })

        });
    } else {
        fileManager.readFile(filePath, next)
    }
};

let renderDirectory = function(directory, relativeDir, key, req, res, next) {
    readify(directory, {sort: 'type'}).then(function(data) {
        directory = path.relative(relativeDir, directory);
        if (key) {
            const encryptionManager = require('./encryptionManager');
            encryptionManager.decryptReadifyNames(data, key, function(data) {
                encryptionManager.decryptFilePath(path.join(relativeDir, directory), key, function(decryptedFilePath) {
                    decryptedFilePath = path.relative(relativeDir, decryptedFilePath);
                    render("directory", {files: data.files, path: directory, path_decrypted: decryptedFilePath, baseUrl: req.baseUrl}, req, res, next);
                });
            });
        } else {
            render("directory", {files: data.files, path: directory, baseUrl: req.baseUrl}, req, res, next);
        }
    }).catch(function(err) {
        log.write(err);
        next(createError(404))
    });
}

let renderFile = function(filePath, key, req, res, next) {
    if (key) {
        const encryptionManager = require('./encryptionManager');
        encryptionManager.decryptFileName(filePath, key, function(decryptedFileName) {
            let name_decrypted = null;
            if (decryptedFileName) name_decrypted = path.basename(decryptedFileName);
            render("fileViewer", {name_decrypted: name_decrypted}, req, res, next);
        });
    } else {
        render("fileViewer", null, req, res, next);
    }
}

let writeFile = function(filePath, contentStream, key, next) {
    if (key) {
        const encryptionManager = require("./encryptionManager");
        let nameIV = encryptionManager.generateIV();
        let contentIV = encryptionManager.generateIV();
        encryptionManager.encryptFileName(filePath, key, nameIV.toString("hex"), function(encryptedFilePath) {
            if (!encryptedFilePath) encryptedFilePath = filePath;
            fs.stat(encryptedFilePath, function(err) {
                if (!err && encryptedFilePath !== filePath) { //File exists and its encrypted
                    log.write("File name collision. Trying another iv...");
                    return writeFile(filePath, contentStream, key, next);
                } else {
                    fs.open(encryptedFilePath, 'a', function(err, fd) {
                        if (err || !fd) encryptedFilePath = filePath;
                        else fs.closeSync(fd);
                        encryptionManager.encryptStream(contentStream, key, contentIV.toString("hex"), function(encryptedStream) {
                            if (encryptedStream) {
                                fileManager.writeFile(encryptedFilePath, encryptedStream, function(err) {
                                    if (next) next(err, encryptedFilePath);
                                }, [nameIV, contentIV]);
                            } else {
                                let err = "Couldn't encrypt file";
                                log.write(err);
                                if (next) next(err);
                            }
                        });
                    });
                }
            });

        });
    } else {
        fileManager.writeFile(filePath, contentStream, next);
    }
};

//const testKey = "0000000000000000000000000000000000000000000000000000000000000000";

module.exports = Object.assign({}, fileManager, {
    createArchive: createArchive,
    downloadFile: downloadFile,
    downloadFolder: downloadFolder,
    inlineFile: inlineFile,
    processUpload: processUpload,
    readFile: readFile,
    renameDecryptDirectory: renameDecryptDirectory,
    renameEncryptDirectory: renameEncryptDirectory,
    renderDirectory: renderDirectory,
    renderFile: renderFile,
    writeFile: writeFile,
});