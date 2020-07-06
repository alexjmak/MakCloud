const accountManager = require("./accountManager");
const preferences = require("./preferences");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const mkdirp = require('mkdirp');
const stream = require("stream");
const tmp = require('tmp');
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

function decryptAccount(id, key, iv, next) {
    let accountPath = path.join(preferences.get("files"), id);
    let tmpdir = path.resolve(path.join(preferences.get("files"), id, "tmp"));
    const fileManager = require("./fileManager");
    fileManager.readDirectory(accountPath, function(dirPath, next) {
        fileManager.walkDirectory(dirPath, function(filePath, isDirectory, next) {
            try {
                decryptFilePath(filePath, key, iv, function(decryptedFilePath) {
                    if (!decryptedFilePath) decryptedFilePath = filePath;
                    fs.rename(filePath, decryptedFilePath, function(err) {
                        if (err) {
                            log.write(err);
                        }
                        if (isDirectory) {
                            if (next) next(decryptedFilePath);
                            return;
                        }
                        fileManager.readFile(decryptedFilePath, key, iv, function(readStream) {
                            mkdirp(tmpdir).then(function() {
                                tmp.tmpName({ tmpdir: tmpdir }, function(err, tmpPath) {
                                    let writeStream = fs.createWriteStream(tmpPath);
                                    readStream.pipe(writeStream);
                                    writeStream.on("close", function() {
                                        fs.rename(tmpPath, decryptedFilePath, function(err) {
                                            if (err) log.write(err);
                                            if (next) next(decryptedFilePath);
                                        });
                                    });
                                });
                            });
                        });
                    })
                });
            } catch (err) {
                //todo backup key
                log.write(err)
                if (next) next();
            }
        }, next);
    }, next);
}

function decryptBuffer(buffer, key, iv, next) {
    let contentStream = new stream.PassThrough();
    contentStream.end(buffer);
    decryptStream(contentStream, key, iv, function(decryptedStream) {
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

function decryptFilePath(filePath, key, iv, next) {
    let basename = path.basename(filePath);
    let dirname = path.dirname(filePath);

    basename = basename.replace(/-/g, "+").replace(/_/g, "/");
    let buffer = Buffer.from(basename, 'base64')
    decryptBuffer(buffer, key, iv, function(decryptedBuffer) {
        if (decryptedBuffer) {
            let decryptedBasename = decryptedBuffer.toString("utf8");
            let decryptedFilePath = path.join(dirname, decryptedBasename);
            if (next) next(decryptedFilePath);
        } else {
            if (next) next(null);
        }
    });
}

function decryptStream(contentStream, key, iv, next) {
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

function encryptAccount(id, key, iv, next) {
    let accountPath = path.join(preferences.get("files"), id);
    let tmpdir = path.resolve(path.join(preferences.get("files"), id, "tmp"));
    const fileManager = require("./fileManager");
    fileManager.readDirectory(accountPath, function(dirPath, next) {
        fileManager.walkDirectory(dirPath, function(filePath, isDirectory, next) {
            try {
                encryptFilePath(filePath, key, iv, function(encryptedFilePath) {
                    fs.rename(filePath, encryptedFilePath, function(err) {
                        if (err) {
                            encryptedFilePath = filePath;
                            log.write(err);
                        }
                        if (isDirectory) {
                            if (next) next(encryptedFilePath);
                            return;
                        }
                        let readStream = fs.createReadStream(encryptedFilePath);
                        encryptStream(readStream, key, iv, function(encryptedStream) {
                            if (encryptedStream) {
                                mkdirp(tmpdir).then(function() {
                                    tmp.tmpName({ tmpdir: tmpdir }, function(err, tmpPath) {
                                        if (err) return log.write(err);
                                        let writeStream = fs.createWriteStream(tmpPath)
                                        encryptedStream.pipe(writeStream);
                                        writeStream.on("close", function() {
                                            fs.rename(tmpPath, encryptedFilePath, function(err) {
                                                if (err)  log.write(err);
                                                if (next) next(encryptedFilePath);
                                            });
                                        })
                                    });
                                });
                            }
                        });
                    })
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
        let bufferArray = [];
        encryptedStream.on("data", function(data) {
            bufferArray.push(data);
        })
        encryptedStream.on("finish", function() {
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

function encryptFilePath(filePath, key, iv, next) {
    let basename = path.basename(filePath);
    let dirname = path.dirname(filePath);
    let buffer = Buffer.from(basename, 'utf8')
    encryptBuffer(buffer, key, iv, function(encryptedBuffer) {
        let encryptedBasename = encryptedBuffer.toString("base64")
                                    .replace(/\+/g, "-")
                                    .replace(/\//g, "_")
                                    .replace(/=/g, "");
        let encryptedFilePath = path.join(dirname, encryptedBasename);
        if (next) next(encryptedFilePath);
    });
}

function encryptionEnabled(req) {
    return req.session && req.session.encryptionKey;
}

function encryptStream(contentStream, key, iv, next) {
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
    decryptFilePath: decryptFilePath,
    decryptStream: decryptStream,
    encryptAccount: encryptAccount,
    encryptEncryptionKey: encryptEncryptionKey,
    encryptFilePath: encryptFilePath,
    encryptionEnabled: encryptionEnabled,
    encryptStream: encryptStream,
    generateEncryptionKey: generateEncryptionKey,
    generatePbkdf2: generatePbkdf2,
    getCipher: getCipher,
    getDecipher: getDecipher,
    isEncrypted: isEncrypted
};