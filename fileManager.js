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
                    fileManager.walkDirectoryPreorder(directories[i], function(filePath, isDirectory, next) {
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

let renameDecryptDirectory = function (filePath, key, iv, next) {
    const encryptionManager = require("./encryptionManager");
    fs.stat(filePath, function(err, stats) {
        if (!stats.isDirectory()) err = "Not a directory";
        if (err) {
            log.write(err);
            if (next) next(err);
            return;
        }
        encryptionManager.getIVs(filePath, function(iv) {
            if (!iv) {
                log.write("IV not found for folder")
                if (next) next();
                return;
            }
            encryptionManager.decryptFileName(filePath, key, iv, function(decryptedFilePath) {
                if (!decryptedFilePath) decryptedFilePath = filePath;
                fs.rename(filePath, decryptedFilePath, function (err) {
                    if (err) {
                        decryptedFilePath = filePath;
                        log.write(err);
                        if (next) next(decryptedFilePath);
                    } else {
                        let ivFile = path.join(filePath, "iv");
                        fs.unlink(ivFile, function() {
                            if (next) next(decryptedFilePath);
                        })
                    }

                });
            });
        });
    });


}


let renameEncryptDirectory = function (filePath, key, iv, next) {
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
                fs.rename(filePath, encryptedFilePath, function (err) {
                    if (err) {
                        encryptedFilePath = filePath;
                        log.write(err);
                    }
                    if (next) next(encryptedFilePath);
                });
            });
        })


    });

}

let readFile = function(filePath, key, iv, next) { //remove iv later
        if (key) {
            const encryptionManager = require("./encryptionManager");
            encryptionManager.getIVs(filePath, function(nameIV, contentIV) {
                console.log("nameIV: " + nameIV.toString("hex"))
                console.log("contentIV: " + contentIV.toString("hex"))
                encryptionManager.decryptFileName(filePath, key, iv, function(decryptedFilePath) {
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

let writeFile = function(filePath, contentStream, key, iv, next) { //remove iv later
    if (key) {
        const encryptionManager = require("./encryptionManager");
        let nameIV = encryptionManager.generateIV();
        let contentIV = encryptionManager.generateIV();
        encryptionManager.encryptFileName(filePath, key, nameIV.toString("hex"), function(encryptedFilePath) {
            if (!encryptedFilePath) encryptedFilePath = filePath;
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

//const key = "25aa8fc4f5db68b0aff20d94b9116c763f09387b1f26240197e77f78e4e8c9ce";



module.exports = Object.assign({}, fileManager, {
    createArchive: createArchive,
    processUpload: processUpload,
    readFile: readFile,
    renameDecryptDirectory: renameDecryptDirectory,
    renameEncryptDirectory: renameEncryptDirectory,
    writeFile: writeFile,
});