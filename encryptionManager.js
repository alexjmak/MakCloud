const accountManager = require("./accountManager");
const preferences = require("./preferences");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const stream = require("stream");
const log = require("./core/log");
const pbkdf2 = require("pbkdf2");

async function checkEncryptionSession(req) {
    if (req.cookies.encryptionSession && req.sessionID) {
        let cookieSession = req.cookies.encryptionSession;
        cookieSession = cookieSession.substring(cookieSession.indexOf(":") + 1, cookieSession.indexOf("."));
        return cookieSession === req.sessionID;
    } else {
        const authorization = require("./authorization");
        const encryptedKey = await accountManager.getInformation("encryptKey", "id", authorization.getID(req));
        return !encryptedKey;
    }
}

async function decryptAccount(id, key) {
    const accountPath = path.join(preferences.get("files"), id);
    const fileManager = require("./fileManager");
    await fileManager.readDirectory(accountPath, async function(filePath, isDirectory) {
        if (!isDirectory) return;
        await fileManager.walkDirectoryPreorder(filePath, async function(filePath, isDirectory) {
            try {
                if (isDirectory) {
                    await fileManager.renameDecryptDirectory(filePath, key);
                    return;
                }
                const readData = await fileManager.readFile(filePath, key);
                const readStream = readData.readStream;
                let decryptedFilePath = readData.decryptedFilePath;
                const encrypted = readData.encrypted;
                if (!decryptedFilePath) decryptedFilePath = filePath;
                    if (encrypted) {
                        await fileManager.writeFile(decryptedFilePath, readStream, null);
                        if (decryptedFilePath !== filePath) {
                            await fs.promises.unlink(filePath);
                        }
                    } else {
                        if (decryptedFilePath !== filePath) {
                            await fs.promises.rename(filePath, decryptedFilePath)
                        }
                    }
            } catch (err) {
                //todo backup key
                log.write(err)
            }
        });
    });
}

async function decryptBuffer(buffer, key, iv) {
    const contentStream = new stream.PassThrough();
    contentStream.end(buffer);
    const decryptedStream = await decryptStream(contentStream, key, iv);
    if (!decryptedStream) return null;
    let bufferArray = [];
    let error = false;

    return new Promise((resolve, reject) => {
        decryptedStream.on("error", function(err) {
            error = true;
        });
        decryptedStream.on("data", function(data) {
            bufferArray.push(data);
        });
        decryptedStream.on("finish", function() {
            if (error) return resolve(null);
            const decryptedBuffer = Buffer.concat(bufferArray);
            resolve(decryptedBuffer);
        });
    });

}

async function decryptEncryptionKey(id, password) {
    let [pbkdf2, derivedKeySalt] = await generateAccountPbkdf2(id, password);
    let key = await accountManager.getInformation("encryptKey", "id", id);
    let iv = await accountManager.getInformation("encryptIV", "id", id);
    if (key === null || iv === null) {
        return Promise.reject("Account is not encrypted");
    } else {
        iv = Buffer.from(iv, "hex");
        key = Buffer.from(key, "hex");
        pbkdf2 = Buffer.from(pbkdf2);
        const decipher = crypto.createDecipheriv('aes-256-cbc', pbkdf2, iv);
        try {
            let decrypted = Buffer.concat([decipher.update(key), decipher.final()]).toString("hex");
            decrypted = decrypted.toString();
            return decrypted;
        } catch {
            return Promise.reject("Decryption error for id: " + id)
        }
    }
}

async function decryptFileName(filePath, key) {
    const basename = path.basename(filePath)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const dirname = path.dirname(filePath);
    const buffer = Buffer.from(basename, 'base64')
    const ivs = await getIVs(filePath)
    if (!ivs) return null;
    const nameIV = ivs.iv1;
    const decryptedBuffer = await decryptBuffer(buffer, key, nameIV);
    if (decryptedBuffer) {
        const decryptedBasename = decryptedBuffer.toString("utf8");
        return path.join(dirname, decryptedBasename);
    } else {
        return null;
    }
}

async function decryptReadifyNames(readifyData, key) { //todo
    const data = Object.assign({}, readifyData);
    let numberFiles = data.files.length;
    async function callback(i) {
        if (i < numberFiles) {
            if (data.files[i].name === "iv") {
                numberFiles--;
                data.files.splice(i, 1);
                return await callback(i);
            }
            const filePath = path.join(data.path, data.files[i].name);
            const decryptedFileName = await decryptFileName(filePath, key);
            if (decryptedFileName) data.files[i].decrypted_name = path.basename(decryptedFileName);
            return await callback(i + 1);
        } else return data;
    }
    return await callback(0);
}

async function decryptFilePath(filePath, key) {
    filePath = path.normalize(filePath);
    filePath = filePath.split(path.sep);
    const decryptedFilePath = [];
    async function callback(i) {
        if (filePath.length > 0) {
            const fileName = filePath.join(path.sep);
            filePath.pop();
            let decryptedFileName = await decryptFileName(fileName, key);
            if (!decryptedFileName) decryptedFileName = fileName;
            decryptedFilePath.splice(0, 0, path.basename(decryptedFileName));
            return await callback(i + 1);
        } else {
            return decryptedFilePath.join(path.sep);
        }
    }
    return await callback(0);
}

async function decryptStream(contentStream, key, iv) {
    if (!key || !iv) return null;
    log.write("Decrypting...");
    try {
        const testDecipher = await getDecipher(key, iv);
        contentStream = contentStream.pipe(testDecipher);
        contentStream.on("error", log.write);
        return contentStream;
    } catch (err) {
        log.write(err.code);
        return null;
    }
}

async function encryptAccount(id, key) {
    const accountPath = path.join(preferences.get("files"), id);
    const fileManager = require("./fileManager");
    await fileManager.readDirectory(accountPath, async function(filePath, isDirectory) {
        if (!isDirectory) return;
        await fileManager.walkDirectoryPostorder(filePath, async function(filePath, isDirectory) {
            try {
                if (isDirectory) {
                    await fileManager.renameEncryptDirectory(filePath, key)
                    return;
                }
                const readStream = (await fileManager.readFile(filePath, null)).readStream;
                const encryptedFileName = await fileManager.writeFile(filePath, readStream, key);
                if (encryptedFileName !== filePath) {
                    await fs.promises.unlink(filePath);
                }
            } catch (err) {
                log.write(err)
                if (next) next();
            }
        });
    });
}

async function encryptBuffer(buffer, key, iv, next) {
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

async function encryptEncryptionKey(key, iv, pbkdf2) {
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(pbkdf2), iv);
    let encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
    encrypted = encrypted.toString("hex");
    return encrypted;
}

async function encryptFileName(filePath, key, iv) {
    const basename = path.basename(filePath);
    const dirname = path.dirname(filePath);
    const buffer = Buffer.from(basename, 'utf8');
    const encryptedBuffer = await encryptBuffer(buffer, key, iv);
    if (encryptedBuffer) {
        let encryptedBasename = encryptedBuffer.toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        return path.join(dirname, encryptedBasename);
    } else {
        return null;
    }

}

function encryptionEnabled(req) {
    return req.session && req.session.encryptionKey;
}

async function encryptStream(contentStream, key, iv) {
    if (!key || !iv) return null;
    log.write("Encrypting...");
    try {
        const testCipher = getCipher(key, iv);
        contentStream = contentStream.pipe(testCipher)
        return contentStream;
    } catch (err) {
        log.write(err.code);
        return null;
    }
}

async function generateAccountPbkdf2(id, password) {
    const authorization = require("./authorization");
    const result = await authorization.checkPassword(id, password);
    if (result === authorization.LOGIN.FAIL) {
        return Promise.reject("Incorrect Password")
    } else {
        let derivedKeySalt = await accountManager.getInformation("derivedKeySalt", "id", id);
        if (!derivedKeySalt) derivedKeySalt = authorization.generateSalt();
        const pbkdf2 = await generatePbkdf2(password, derivedKeySalt);
        return [pbkdf2, derivedKeySalt];
    }

}

async function generateEncryptionKey(id, password) {
    const [pbkdf2, derivedKeySalt] = await generateAccountPbkdf2(id, password);
    let iv = crypto.randomBytes(16);
    const key = crypto.randomBytes(32);
    const encryptedKey = await encryptEncryptionKey(key, iv, pbkdf2);
    iv = iv.toString("hex");
    return {key: encryptedKey, iv: iv, salt: derivedKeySalt};
}

async function generatePbkdf2(password, derivedKeySalt) {
    return new Promise((resolve, reject) => {
        pbkdf2.pbkdf2(password, derivedKeySalt, 1, 32, 'sha512', function(err, pbkdf2) {
            if (err) return reject(err);
            resolve(pbkdf2);
        });
    });
}

function generateIV() {
    return new Promise((resolve, reject) => {
        crypto.randomBytes(16, function(err, buffer) {
            if (err) return reject(err);
            resolve(buffer);
        });
    });
}

function getCipher(key, iv) {
    try {
        key = Buffer.from(key, "hex");
        iv = Buffer.from(iv, "hex");
        return crypto.createCipheriv('aes-256-cbc', key, iv);
    } catch (err) {
        log.write(err);
        return null;
    }
}

function getDecipher(key, iv) {
    try {
        key = Buffer.from(key, "hex");
        iv = Buffer.from(iv, "hex");
        return crypto.createDecipheriv('aes-256-cbc', key, iv);
    } catch (err) {
        log.write(err);
        return null;
    }
}

async function getIVs(filePath) {
    let stats;
    try {
        stats = await fs.promises.stat(filePath);
    } catch (err) {
        log.write(err);
        return null;
    }

    return new Promise((resolve, reject) => {
        if (stats.isDirectory()) {
            let ivFile = path.join(filePath, "iv")
            fs.open(ivFile, "r", function(err, fd) {
                if (err) {
                    log.write("IV not found for directory");
                    return resolve(null);
                }
                fs.read(fd, Buffer.alloc(16), 0, 16, 0, function(err, bytesRead, iv1) {
                    fs.close(fd, function() {
                        resolve({iv1: iv1});
                    });
                });
            });
        } else {
            fs.open(filePath, "r", function(err, fd) {
                fs.read(fd, Buffer.alloc(16), 0, 16, 0, function(err, bytesRead, iv1) {
                    fs.read(fd, Buffer.alloc(16), 0, 16, 16, function(err, bytesRead, iv2) {
                        fs.close(fd, function() {
                            resolve({iv1: iv1, iv2: iv2});
                        });
                    });
                });
            });
        }
    })



}

function isEncrypted(contentStream, key, iv) {
    return new Promise((resolve, reject) => {
        const testDecipher = getDecipher(key, iv);
        contentStream = contentStream.pipe(testDecipher)
        contentStream.on("data", function() {
        });
        contentStream.on("error", function(error) {
            resolve(false);
        });
        contentStream.on("end", function() {
            resolve(true);
        });
    });
}

module.exports = {
    checkEncryptionSession: checkEncryptionSession,
    decryptAccount: decryptAccount,
    decryptEncryptionKey: decryptEncryptionKey,
    decryptFileName: decryptFileName,
    decryptReadifyNames: decryptReadifyNames,
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