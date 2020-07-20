const accountManager = require("./accountManager");
const preferences = require("./preferences");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const stream = require("stream");
const log = require("./core/log");
const pbkdf2 = require("pbkdf2");

function checkEncryptionSession(req, next) {
    if (req.cookies.encryptionSession && req.sessionID) {
        let cookieSession = req.cookies.encryptionSession;
        cookieSession = cookieSession.substring(cookieSession.indexOf(":") + 1, cookieSession.indexOf("."));
        if (cookieSession !== req.sessionID) {
            if (next !== undefined) next(false);
            return;
        }
    }

    if (next !== undefined) next(true);
}

function decryptAccount(id, key, next) {
    let accountPath = path.join(preferences.get("files"), id);
    const fileManager = require("./fileManager");
    fileManager.readDirectory(accountPath, function(filePath, isDirectory, next) {
        if (!isDirectory) {
            if (next) next();
            return;
        }
        fileManager.walkDirectoryPreorder(filePath, function(filePath, isDirectory, next) {
            try {
                if (isDirectory) {
                    fileManager.renameDecryptDirectory(filePath, key, next);
                } else {
                    fileManager.readFile(filePath, key, function(readStream, decryptedFilePath) {
                        if (!decryptedFilePath) decryptedFilePath = filePath;
                        fileManager.writeFile(decryptedFilePath, readStream, null, function() {
                            if (decryptedFilePath !== filePath) {
                                fs.unlink(filePath, function() {
                                    next();
                                })
                            } else {
                                next();
                            }
                        });
                    });
                }
            } catch (err) {
                //todo backup key
                log.write(err)
                next();
            }
        }, next);
    }, next);
}

function decryptBuffer(buffer, key, iv, next) {
    let contentStream = new stream.PassThrough();
    contentStream.end(buffer);
    decryptStream(contentStream, key, iv, function(decryptedStream) {
        if (!decryptedStream) {
            if (next) next(null);
            return;
        }
        let bufferArray = [];
        let error = false;
        decryptedStream.on("error", function(err) {
            error = true;
        });

        decryptedStream.on("data", function(data) {
            bufferArray.push(data);
        });

        decryptedStream.on("finish", function() {
            if (error) {
                if (next) next(null);
                return;
            }
            let decryptedBuffer = Buffer.concat(bufferArray);
            if (next) next(decryptedBuffer);
        });
    });
}

function decryptEncryptionKey(id, password, next) {
    generateAccountPbkdf2(id, password, function(pbkdf2) {
        if (pbkdf2 === false) {
            if (next !== undefined) next(false);
        } else {
            accountManager.getInformation("encryptKey", "id", id, function(key) {
                accountManager.getInformation("encryptIV", "id", id, function(iv) {
                    if (key === null || iv === null) {
                        if (next !== undefined) next(false);
                    } else {
                        iv = Buffer.from(iv, "hex");
                        key = Buffer.from(key, "hex");
                        pbkdf2 = Buffer.from(pbkdf2);
                        let decipher = crypto.createDecipheriv('aes-256-cbc', pbkdf2, iv);
                        let decrypted;
                        try {
                            decrypted = Buffer.concat([decipher.update(key), decipher.final()]).toString("hex");
                        } catch {
                            log.write("Decryption error for id: " + id);
                            if (next !== undefined) next(false);
                            return;
                        }
                        decrypted = decrypted.toString();
                        if (next !== undefined) next(decrypted, iv.toString("hex"));
                    }
                });
            });
        }
    });
}

function decryptFileName(filePath, key, next) {
    let basename = path.basename(filePath);
    let dirname = path.dirname(filePath);

    basename = basename.replace(/-/g, "+").replace(/_/g, "/");
    let buffer = Buffer.from(basename, 'base64')

    getIVs(filePath, function(iv) {
        decryptBuffer(buffer, key, iv, function(decryptedBuffer) {
            if (decryptedBuffer) {
                let decryptedBasename = decryptedBuffer.toString("utf8");
                let decryptedFilePath = path.join(dirname, decryptedBasename);
                if (next) next(decryptedFilePath);
            } else {
                if (next) next(null);
            }
        });
    })

}

function decryptFileNames(filePaths, key, next) { //todo
    let decryptedFileNames = {};
    function callback(i) {
        if (filePaths.length > 0) {
            let filePath = filePaths.join(path.sep);
            filePaths = filePaths.pop();
            decryptFileName(filePath, key, function(decryptedFilePath) {
                if (!decryptedFilePath) decryptedFilePath = filePath;
                decryptedFileNames[path.basename(filePath)] = decryptedFilePath;
                callback(i + 1);
            });
        } else {
            if (next) next(decryptedFileNames);
        }
    }
    callback(0);
}

function decryptFilePath(filePath, key, next) {
    filePath = filePath.split(path.sep);
    let decryptedFilePath = [];
    function callback(i) {

        if (filePath.length > 0) {
            let fileName = filePath.join(path.sep);
            filePath = filePath.pop();

            decryptFileName(fileName, key, function(decryptedFileName) {
                if (!decryptedFileName) decryptedFileName = fileName;
                decryptedFilePath.push(path.basename(decryptedFileName));
                callback(i + 1);
            });
        } else {
            decryptedFilePath = decryptedFilePath.join(path.sep);
            if (next) next(decryptedFilePath);
        }
    }
    callback(0);
}

function decryptStream(contentStream, key, iv, next) {
    if (!key || !iv) {
        if (next) next(null);
        return;
    }
    log.write("Decrypting...");
    getDecipher(key, iv, function(err, testDecipher) {
        if (err) {
            log.write(err.code);
            if (next !== undefined) next(null);
        } else {
            contentStream = contentStream.pipe(testDecipher)

            contentStream.on("error", function(err) {
                log.write(err)
            });

            next(contentStream)
        }

    });
}

function encryptAccount(id, key, next) {
    let accountPath = path.join(preferences.get("files"), id);
    const fileManager = require("./fileManager");
    fileManager.readDirectory(accountPath, function(filePath, isDirectory, next) {
        if (!isDirectory) {
            if (next) next();
            return;
        }
        fileManager.walkDirectoryPostorder(filePath, function(filePath, isDirectory, next) {
            try {
                if (isDirectory) {
                    fileManager.renameEncryptDirectory(filePath, key, next)
                    return;
                }
                fileManager.readFile(filePath, null, function(readStream) {
                    fileManager.writeFile(filePath, readStream, key, function(err, encryptedFileName) {
                        if (encryptedFileName !== filePath) {
                            fs.unlink(filePath, function() {
                                next();
                            });
                        } else {
                            next();
                        }
                    });
                });
            } catch (err) {
                log.write(err)
                if (next) next();
            }
        }, next);
    }, next);
}

function encryptBuffer(buffer, key, iv, next) {
    let contentStream = new stream.PassThrough();
    contentStream.end(buffer);
    encryptStream(contentStream, key, iv, function(encryptedStream) {
        if (!encryptedStream) {
            if (next) next(null);
            return;
        }
        let bufferArray = [];
        let error = false;

        encryptedStream.on("error", function(err) {
            error = true;
        });

        encryptedStream.on("data", function(data) {
            bufferArray.push(data);
        });

        encryptedStream.on("finish", function() {
            if (error) {
                if (next) next(null)
                return;
            }
            let encryptedBuffer = Buffer.concat(bufferArray);
            next(encryptedBuffer);
        })
    })
}

function encryptEncryptionKey(key, iv, pbkdf2, next) {
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(pbkdf2), iv);
    let encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
    encrypted = encrypted.toString("hex");
    if (next !== undefined) next(encrypted);
}

function encryptFileName(filePath, key, iv, next) {
    let basename = path.basename(filePath);
    let dirname = path.dirname(filePath);
    let buffer = Buffer.from(basename, 'utf8');
    encryptBuffer(buffer, key, iv, function(encryptedBuffer) {
        if (encryptedBuffer) {
            let encryptedBasename = encryptedBuffer.toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=/g, "");
            let encryptedFilePath = path.join(dirname, encryptedBasename);
            if (next) next(encryptedFilePath);
        } else {
            if (next) next(null);
        }
    });
}

function encryptionEnabled(req) {
    return req.session && req.session.encryptionKey;
}

function encryptStream(contentStream, key, iv, next) {
    if (!key || !iv) {
        if (next) next(null);
        return;
    }
    log.write("Encrypting...");
    getCipher(key, iv, function(err, testCipher) {
        if (err) {
            log.write(err.code);
            if (next !== undefined) next(null);
        } else {
            contentStream = contentStream.pipe(testCipher)
            next(contentStream)
        }
    });
}

function generateAccountPbkdf2(id, password, next) {
    const authorization = require("./authorization");
    authorization.checkPassword(id, password, function(result) {
        if (result === authorization.LOGIN.FAIL) {
            if (next !== undefined) next(false);
        } else {
            accountManager.getInformation("derivedKeySalt", "id", id, function(derivedKeySalt) {
                if (!derivedKeySalt) derivedKeySalt = authorization.generateSalt();
                generatePbkdf2(password, derivedKeySalt, function(pbkdf2) {
                    if (next !== undefined) next(pbkdf2, derivedKeySalt);
                });
            });
        }
    });
}

function generateEncryptionKey(id, password, next) {
    generateAccountPbkdf2(id, password, function (pbkdf2, derivedKeySalt) {
        if (pbkdf2 === false) {
            if (next !== undefined) next(false);
        } else {
            let iv = crypto.randomBytes(16);
            let key = crypto.randomBytes(32);
            encryptEncryptionKey(key, iv, pbkdf2, function(encryptedKey) {
                iv = iv.toString("hex");
                if (next !== undefined) next(encryptedKey, iv, derivedKeySalt);
            });
        }
    });
}

function generatePbkdf2(password, derivedKeySalt, next) {
    pbkdf2.pbkdf2(password, derivedKeySalt, 1, 32, 'sha512', function(nothing, pbkdf2) {
        if (next !== undefined) next(pbkdf2);
    });
}

function generateIV() {
    return crypto.randomBytes(16);
}

function getCipher(key, iv, next) {
    key = Buffer.from(key, "hex");
    iv = Buffer.from(iv, "hex");
    try {
        let cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        if (next) next(null, cipher)
    } catch (err) {
        log.write(err);
        if (next) return next(err);
    }
}

function getDecipher(key, iv, next) {
    key = Buffer.from(key, "hex");
    iv = Buffer.from(iv, "hex");
    try {
        let decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        if (next) next(null, decipher)
    } catch (err) {
        log.write(err);
        if (next) return next(err);
    }
}

let getIVs = function(filePath, next) {
    fs.stat(filePath, function(err, stats) {
        if (err) {
            log.write(err);
            if (next) next(null);
            return;
        }
        if (stats.isDirectory()) {
            let ivFile = path.join(filePath, "iv")
            fs.open(ivFile, "r", function(err, fd) {
                if (err) {
                    log.write("IV not found for directory");
                    if (next) next(null);
                    return;
                }
                let iv1 = Buffer.alloc(16);
                fs.read(fd, iv1, 0, 16, 0, function(err, bytesRead, iv1) {
                    fs.close(fd, function() {
                        if (next) next(iv1);
                    });
                });
            });
        } else {
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
    })

}

function isEncrypted(contentStream, key, iv, next) {
    getDecipher(key, iv, function(err, testDecipher) {
        if (err) {
            log.write(err.code);
            if (next !== undefined) next(null);
        }
        contentStream = contentStream.pipe(testDecipher)

        contentStream.on("data", function() {
        });

        contentStream.on("error", function(error) {
            next(false)
        });

        contentStream.on("end", function() {
            next(true)
        });
    });
}

module.exports = {
    checkEncryptionSession: checkEncryptionSession,
    decryptAccount: decryptAccount,
    decryptEncryptionKey: decryptEncryptionKey,
    decryptFileName: decryptFileName,
    decryptFileNames: decryptFileNames,
    decryptFilePath: decryptFilePath,
    decryptStream: decryptStream,
    encryptAccount: encryptAccount,
    encryptEncryptionKey: encryptEncryptionKey,
    encryptFileName: encryptFileName,
    encryptionEnabled: encryptionEnabled,
    encryptStream: encryptStream,
    getIVs: getIVs,
    generateEncryptionKey: generateEncryptionKey,
    generateIV: generateIV,
    generatePbkdf2: generatePbkdf2,
    getCipher: getCipher,
    getDecipher: getDecipher,
    isEncrypted: isEncrypted
};