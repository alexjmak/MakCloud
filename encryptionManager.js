const accountManager = require("./accountManager");
const preferences = require("./preferences");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const stream = require("stream");
const log = require("./log");
const pbkdf2 = require("pbkdf2");

function encryptionEnabled(req) {
    return req.session && req.session.encryptionKey;
}

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

function generatePbkdf2(password, derivedKeySalt, next) {
    pbkdf2.pbkdf2(password, derivedKeySalt, 1, 32, 'sha512', function(nothing, pbkdf2) {
        if (next !== undefined) next(pbkdf2);
    });
}

function generateAccountPbkdf2(id, password, next) {
    const authorization = require("./authorization");
    authorization.checkPassword(id, password, function(result) {
        if (result !== 0) {
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

function encryptEncryptionKey(key, iv, pbkdf2, next) {
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(pbkdf2), iv);
    let encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
    encrypted = encrypted.toString("hex");
    if (next !== undefined) next(encrypted);
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

function encryptStream(stream, key, iv, next) {
    log.write("Encrypting...");
    key = Buffer.from(key, "hex");
    iv = Buffer.from(iv, "hex");
    let cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    stream = stream.pipe(cipher);
    stream.on("error", function(err) {
        log.write(err);
    });
    if (next !== undefined) next(stream);

}

function decryptStream(stream, key, iv, next) {
    log.write("Decrypting...");
    key = Buffer.from(key, "hex");
    iv = Buffer.from(iv, "hex");
    let cipher;
    try {
        cipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    } catch (err) {
        log.write(err);
        if (next !== undefined) next(err);
        return;
    }
    stream = stream.pipe(cipher);
    stream.on("error", function(err) {
        log.write(err);
    });
    if (next !== undefined) next(stream);
}

function encryptAccount(id, key, iv, next) {
    let filesPath = path.join(preferences.get("files"), id.toString());
    const fileManager = require("./fileManager");
    fileManager.walkDirectory(filesPath, function(filePath) {
        let readStream = fs.createReadStream(filePath);
        encryptStream(readStream, key, iv, function(encryptedStream) {
            let error = false;
            encryptedStream.on("error", function() {
                error = true;
            });
            encryptedStream.on("finish", function() {
                if (error) return;
                encryptedStream.pipe(fs.createWriteStream(filePath));
            });
        });

    }, next)
}

function decryptAccount(id, key, iv, next) {
    let filesPath = path.join(preferences.get("files"), id.toString());
    const fileManager = require("./fileManager");
    fileManager.walkDirectory(filesPath, function(filePath) {
        try {
            let readStream = fs.createReadStream(filePath);
            decryptStream(readStream, key, iv, function(decryptedStream) {
                let error = false;
                decryptedStream.on("error", function() {
                    error = true;
                })
                decryptedStream.on("finish", function() {
                    if (error) return;
                    decryptedStream.pipe(fs.createWriteStream(filePath))
                });
            });

        } catch (err) {
            //todo backup key
            return log.write(err)}
    }, next)

}

module.exports = {
    checkEncryptionSession: checkEncryptionSession,
    encryptionEnabled: encryptionEnabled,
    generatePbkdf2: generatePbkdf2,
    generateEncryptionKey: generateEncryptionKey,
    encryptEncryptionKey: encryptEncryptionKey,
    decryptEncryptionKey: decryptEncryptionKey,
    encryptStream: encryptStream,
    decryptStream: decryptStream,
    encryptAccount: encryptAccount,
    decryptAccount: decryptAccount
};