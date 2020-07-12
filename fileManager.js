const fs = require("fs");
const multer = require("multer")
const multerStorage = require('./modules/multer/StorageEngine');
const path = require("path");
const log = require("./core/log");

const fileManager = require("./core/fileManager");


let createArchive = function(directories, key, iv, next) {
    if (key && iv) {
        fileManager.initArchive(function(archive) {
            if (typeof directories === "string") directories = [directories];
            function callback(i) {
                if (directories.hasOwnProperty(i)) {
                    fileManager.walkDirectory(directories[i], function(filePath, isDirectory, next) {
                        if (isDirectory) return next();
                        readFile(filePath, key, iv, function(readStream) {
                            let name = path.relative(path.dirname(directories[i]), filePath);
                            const encryptionManager = require("./encryptionManager");

                            encryptionManager.decryptFilePath(name, key, iv, function(decryptedName) {
                                archive.append(readStream, { name: decryptedName});
                                return next();
                            })

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
        })
    } else {
        fileManager.createArchive(directories, next);
    }
}

let processUpload = function(saveLocation, key, iv) {
    return function(req, res, next) {
        let uploadFile = function(file, next) {
            let filePath = path.join(saveLocation, file.originalname);
            writeFile(filePath, file.stream, key, iv, next);
        }
        return multer({storage: multerStorage(uploadFile)}).any()(req, res, function(err) {
            if (err) return res.status(500).send("Upload failed");
            if (Object.keys(req.files).length === 1) res.send("Uploaded file");
            else res.send("Uploaded files");
        });
    }
}

let readFile = function(filePath, key, iv, next) {
    fileManager.readFile(filePath, function(readStream) {
        if (key && iv) {
            const encryptionManager = require("./encryptionManager");
            encryptionManager.isEncrypted(fs.createReadStream(filePath), key, iv, function(encrypted) {
                if (encrypted) {
                    encryptionManager.decryptStream(readStream, key, iv, function(decryptedStream) {
                        next(decryptedStream);
                    });
                } else {
                    log.write("Sending raw file...");
                    fileManager.readFile(filePath, next);
                }
            })
        } else {
            if (next) next(readStream);
        }
    })

};

let renameDecryptFileName = function (filePath, key, iv, next) {
    const encryptionManager = require("./encryptionManager");
    encryptionManager.decryptFileName(filePath, key, iv, function(decryptedFilePath) {
        if (!decryptedFilePath) decryptedFilePath = filePath;
        fs.rename(filePath, decryptedFilePath, function (err) {
            if (err) {
                decryptedFilePath = filePath;
                log.write(err);
            }
            if (next) next(decryptedFilePath);
        });
    });
}


let renameEncryptFileName = function (filePath, key, iv, next) {
    const encryptionManager = require("./encryptionManager");
    encryptionManager.encryptFileName(filePath, key, iv, function(encryptedFilePath) {
        if (!encryptedFilePath) encryptedFilePath = filePath;
        fs.rename(filePath, encryptedFilePath, function (err) {
            if (err) {
                encryptedFilePath = filePath;
                log.write(err);
            }
            if (next) next(encryptedFilePath);
        });
    });
}

let readFile2 = function(filePath, key, next) {
        if (key) {
            const encryptionManager = require("./encryptionManager");
            getIVs(filePath, function(nameIV, contentIV) {
                console.log("nameIV: " + nameIV.toString("hex"))
                console.log("contentIV: " + contentIV.toString("hex"))
                encryptionManager.isEncrypted(fs.createReadStream(filePath, {start: 32}), key, contentIV, function(encrypted) {
                    if (encrypted) {
                        encryptionManager.decryptStream(fs.createReadStream(filePath, {start: 32}), key, contentIV, function(decryptedStream) {
                            next(decryptedStream);
                        });
                    } else {
                        log.write("Sending raw file...");
                        fileManager.readFile(filePath, next);
                    }
                })
            });


        } else {
            fileManager.readFile(filePath, next)
        }

};

let getIVs = function(filePath, next) {
    fs.open(filePath, "r", function(err, fd) {
        let iv1 = Buffer.alloc(16);
        let iv2 = Buffer.alloc(16);
        fs.read(fd, iv1, 0, 16, 0, function(err, bytesRead, iv1) {
            fs.read(fd, iv2, 0, 16, 16, function(err, bytesRead, iv2) {
                fs.close(fd, function() {
                    if (next) next(iv1, iv2);
                });
            });
        });
    });
}

let writeFile2 = function(filePath, contentStream, key, next) {
    if (key) {
        const encryptionManager = require("./encryptionManager");
        let nameIV = encryptionManager.generateIV();
        let contentIV = encryptionManager.generateIV();
        encryptionManager.encryptFileName(filePath, key, nameIV.toString("hex"), function(encryptedFilePath) {
            if (!encryptedFilePath) encryptedFilePath = filePath;
            encryptedFilePath = filePath;
            fs.open(encryptedFilePath, 'a', function(err, fd) {
                if (err || !fd) encryptedFilePath = filePath;
                else fs.closeSync(fd);
                encryptionManager.encryptStream(contentStream, key, contentIV.toString("hex"), function(encryptedStream) {
                    if (encryptedStream) {
                        fileManager.writeFile(encryptedFilePath, encryptedStream, next, [nameIV, contentIV]);
                    } else {
                        let err = "Couldn't encrypt file";
                        log.write(err);
                        if (next) next(err);
                    }
                });
            })

        });
    } else {
        fileManager.writeFile(filePath, contentStream, next);
    }
};

const key = "25aa8fc4f5db68b0aff20d94b9116c763f09387b1f26240197e77f78e4e8c9ce";
writeFile2("teste.txt", fs.createReadStream("TODO.txt"), key, function() {
    readFile2("teste.txt", key, function(readStream) {
        writeFile("teste2.txt", readStream, null, null);
    })
})

let writeFile = function(filePath, contentStream, key, iv, next) {
    if (key && iv) {
        const encryptionManager = require("./encryptionManager");
        encryptionManager.encryptFileName(filePath, key, iv, function(encryptedFilePath) {
            if (!encryptedFilePath) encryptedFilePath = filePath;
            fs.open(encryptedFilePath, 'a', function(err, fd) {
                if (err || !fd) encryptedFilePath = filePath;
                else fs.closeSync(fd);
                encryptionManager.encryptStream(contentStream, key, iv, function(encryptedStream) {
                    if (encryptedStream) {
                        fileManager.writeFile(encryptedFilePath, encryptedStream, next);
                    } else {
                        let err = "Couldn't encrypt file";
                        log.write(err);
                        if (next) next(err);
                    }
                });
            })

        });
    } else {
        fileManager.writeFile(filePath, contentStream, next);
    }
};

module.exports = Object.assign({}, fileManager, {
    createArchive: createArchive,
    processUpload: processUpload,
    readFile: readFile,
    renameDecryptFileName: renameDecryptFileName,
    renameEncryptFileName: renameEncryptFileName,
    writeFile: writeFile,
});