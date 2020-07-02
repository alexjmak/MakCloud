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
    let filesPath = path.join(preferences.get("files"), id.toString());
    let tmpdir = path.resolve(path.join(preferences.get("files"), id.toString(), "tmp"));
    const fileManager = require("./fileManager");
    fileManager.walkDirectory(filesPath, function(filePath) {
        try {
            fileManager.readFile(filePath, key, iv, function(readStream) {
                mkdirp(tmpdir).then(function() {
                    tmp.tmpName({ tmpdir: tmpdir }, function(err, tmpPath) {
                        let writeStream = fs.createWriteStream(tmpPath);
                        readStream.pipe(writeStream);
                        writeStream.on("close", function() {
                            fs.rename(tmpPath, filePath, function(err) {
                                if (err) log.write(err);
                                //next
                            });
                        });
                    });
                });

            });
        } catch (err) {
            //todo backup key
            return log.write(err)}
    }, next);

}

function decryptBuffer(buffer, key, iv, next) {
    let contentStream = new stream.PassThrough();
    contentStream.end(buffer);
    decryptStream(contentStream, key, iv, function(decryptedStream) {
        let bufferArray = [];
        decryptedStream.on("data", function(data) {
            bufferArray.push(data);
        })
        decryptedStream.on("finish", function() {
            let decryptedStream = Buffer.concat(bufferArray);
            next(decryptedStream);
        })
    })
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
    let filesPath = path.join(preferences.get("files"), id.toString());
    let tmpdir = path.resolve(path.join(preferences.get("files"), id.toString(), "tmp"));
    const fileManager = require("./fileManager");
    fileManager.walkDirectory(filesPath, function(filePath) {
        let readStream = fs.createReadStream(filePath);
        encryptStream(readStream, key, iv, function(encryptedStream) {
            if (encryptedStream) {
                mkdirp(tmpdir).then(function() {
                    tmp.tmpName({ tmpdir: tmpdir }, function(err, tmpPath) {
                        if (err) return log.write(err);
                        let writeStream = fs.createWriteStream(tmpPath)
                        encryptedStream.pipe(writeStream);
                        writeStream.on("close", function() {
                            fs.rename(tmpPath, filePath, function(err) {
                                if (err) return log.write(err);
                                //next
                            })
                        })

                    });
                });


            }
        });
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
        if (result === authorization.LOGIN_FAIL) {
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
    decryptStream: decryptStream,
    encryptAccount: encryptAccount,
    encryptEncryptionKey: encryptEncryptionKey,
    encryptionEnabled: encryptionEnabled,
    encryptStream: encryptStream,
    generateEncryptionKey: generateEncryptionKey,
    generatePbkdf2: generatePbkdf2,
    getCipher: getCipher,
    getDecipher: getDecipher,
    isEncrypted: isEncrypted
};