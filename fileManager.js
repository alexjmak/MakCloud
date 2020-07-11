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

let writeFile = function(filePath, contentStream, key, iv, next) {
    if (key && iv) {
        const encryptionManager = require("./encryptionManager");
        encryptionManager.encryptFileName(filePath, key, iv, function(encryptedFilePath) {
            if (!encryptedFilePath) encryptedFilePath = filePath;
            encryptionManager.encryptStream(contentStream, key, iv, function(encryptedStream) {
                if (encryptedStream) {
                    fileManager.writeFile(encryptedFilePath, encryptedStream, next);
                } else {
                    let err = "Couldn't encrypt file";
                    log.write(err);
                    if (next) next(err);
                }
            });
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