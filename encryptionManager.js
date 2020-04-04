const accountManager = require("./accountManager");
const crypto = require("crypto");
const log = require("./log");
const stream = require('stream');
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

function generatePbkdf2(id, password, next) {
    const authorization = require("./authorization");
    authorization.checkPassword(id, password, function(result) {
        if (result !== 0) {
            if (next !== undefined) next(false);
        } else {
            accountManager.getInformation("derivedKeySalt", "id", id, function(salt) {
                if (!salt) salt = authorization.generateSalt();
                pbkdf2.pbkdf2(password, salt, 1, 32, 'sha512', function(nothing, pbkdf2) {
                    if (next !== undefined) next(pbkdf2, salt);
                });
            });
        }
    });
}
function generateEncryptionKey(id, password, next) {
    generatePbkdf2(id, password, function (pbkdf2, salt) {
        if (pbkdf2 === false) {
            if (next !== undefined) next(false);
        } else {
            let iv = crypto.randomBytes(16);
            let key = crypto.randomBytes(32);
            let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(pbkdf2), iv);
            let encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
            encrypted = encrypted.toString("hex");
            iv = iv.toString("hex");
            if (next !== undefined) next(encrypted, iv, salt);
        }
    });
}

function decryptEncryptionKey(id, password, next) {
    generatePbkdf2(id, password, function(pbkdf2) {
        if (pbkdf2 === false) {
            if (next !== undefined) next(false);
        } else {
            accountManager.getInformation("encryptKey", "id", id, function(key) {
                accountManager.getInformation("encryptIV", "id", id, function(iv) {
                    if (key === null || iv === null) {
                        if (next !== undefined) next(false);
                    } else {
                        iv = Buffer.from(iv, "hex");
                        key = Buffer.from(key, 'hex');
                        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(pbkdf2), iv);
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
    log.write("Encrypting file...");
    let encryptStream = new stream.PassThrough();
    encryptStream.end(buffer);
    key = Buffer.from(key, "hex");
    iv = Buffer.from(iv, "hex");
    let cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    encryptStream = encryptStream.pipe(cipher);
    if (next !== undefined) next(encryptStream);
}

function decryptStream(stream, key, iv, next) {
    log.write("Decrypting file...");
    key = Buffer.from(key, "hex");
    iv = Buffer.from(iv, "hex");
    let cipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    stream = stream.pipe(cipher);
    stream.on("error", function(err) {
        log.write("Decryption error");
    })
    if (next !== undefined) next(stream);
}

module.exports = {
    checkEncryptionSession: checkEncryptionSession,
    encryptionEnabled: encryptionEnabled,
    generateEncryptionKey: generateEncryptionKey,
    decryptEncryptionKey: decryptEncryptionKey,
    encryptBuffer: encryptBuffer,
    decryptStream: decryptStream,
};