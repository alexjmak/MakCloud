const fs = require("fs");
const mime = require("mime");
const multer = require("multer")
const multerStorage = require('./core/modules/multer/StorageEngine');
const path = require("path");
const log = require("./core/log");
const readify = require("readify");
const localeManager = require("./core/localeManager");
const createError = require("http-errors");
const fileManager = require("./core/fileManager");
const render = require("./core/render");

async function createArchive(directories, key) {
    const archive = fileManager.initArchive();
    if (typeof directories === "string") directories = [directories];
    async function callback(i) {
        if (directories.hasOwnProperty(i)) {
            directories[i] = path.normalize(directories[i]);
            if (directories[i].endsWith("/")) {
                directories[i] = directories[i].substring(0, directories[i].length - 1);
            }
            await fileManager.walkDirectoryPreorder(directories[i], async function(filePath, isDirectory) {
                if (isDirectory) return;
                if (key && path.basename(filePath) === "iv") return;
                const readData = await readFile(filePath, key);
                const readStream = readData.readStream;
                const decryptedFilePath = readData.decryptedFilePath;
                const parentLength = directories[i].split(path.sep).length
                const name = decryptedFilePath.split(path.sep).splice(parentLength).join(path.sep);
                archive.append(readStream, {name: name});
            });
            return await callback(i + 1);
        } else {
            archive.finalize();
            return archive;
        }
    }
    return await callback(0);
}

function processUpload(saveLocation, key, overwrite, req, res, next) {
    const locale = localeManager.get(req);
    return new Promise((resolve, reject) => {
        const uploadFile = async function (file) {
            let filePath = path.join(saveLocation, file.originalname);
            await writeFile(filePath, file.stream, key, overwrite);
        }
        return multer({storage: multerStorage(uploadFile)}).any()(req, res, function (err) {
            if (err) res.status(500).send(locale.uploaded_failed);
            else if (Object.keys(req.files).length === 1) res.send(locale.uploaded_file);
            else res.send(locale.uploaded_files);
            resolve();
        });
    })
}

async function renameDecryptDirectory(filePath, key) {
    const encryptionManager = require("./encryptionManager");
    const stats = await fs.promises.stat(filePath);
    if (!stats.isDirectory()) return Promise.reject("File path is not a directory");
    let decryptedFilePath = await encryptionManager.decryptFileName(filePath, key);
    if (!decryptedFilePath) decryptedFilePath = filePath;
    try {
        await fs.promises.rename(filePath, decryptedFilePath);
        const ivFile = path.join(decryptedFilePath, "iv");
        await fs.promises.unlink(ivFile);
    } catch {
        decryptedFilePath = filePath;
        log.write(err);
    }
    return decryptedFilePath;
}

async function renameEncryptDirectory(filePath, key) {
    const encryptionManager = require("./encryptionManager");
    const stats = await fs.promises.stat(filePath);
    if (!stats.isDirectory()) return Promise.reject("File path is not a directory");
    const ivFile = path.join(filePath, "iv");
    const iv = await encryptionManager.generateIV();
    await fs.promises.writeFile(ivFile, iv);
    let encryptedFilePath = await encryptionManager.encryptFileName(filePath, key, iv);
    if (!encryptedFilePath) encryptedFilePath = filePath;
    let exists;
    try {
        await fs.promises.stat(encryptedFilePath);
        exists = true;
    } catch {
        exists = false;
    }
    if (exists && encryptedFilePath !== filePath) { //File exists and its encrypted
        log.write("File name collision. Trying another iv...");
        return await renameEncryptDirectory(filePath, key);
    }
    try {
        await fs.promises.rename(filePath, encryptedFilePath);
    } catch (err) {
        encryptedFilePath = filePath;
    }
    return encryptedFilePath;
}

async function readFile(filePath, key) {
    if (!key) {
        const readStream = await fileManager.readFile(filePath);
        return {readStream: readStream, decryptedFilePath: filePath, encrypted: false};
    }
    const encryptionManager = require("./encryptionManager");
    const ivs = await encryptionManager.getIVs(filePath);
    const contentIV = ivs.iv2;
    let decryptedFilePath = await encryptionManager.decryptFilePath(filePath, key);
    if (!decryptedFilePath) decryptedFilePath = filePath;
    const encrypted = await encryptionManager.isEncrypted(fs.createReadStream(filePath, {start: 32}), key, contentIV);
    let readStream;
    if (encrypted) {
        readStream = await encryptionManager.decryptStream(fs.createReadStream(filePath, {start: 32}), key, contentIV);
    } else {
        log.write("Sending raw file...");
        readStream = await fileManager.readFile(filePath);
    }
    return {readStream: readStream, decryptedFilePath: decryptedFilePath, encrypted: encrypted};
}

async function renderDirectory(directory, relativeDirectory, key, req, res, next) {
    try {
        if (!key) {
            return await fileManager.renderDirectory(directory, relativeDirectory, req, res, next);
        }
        let data = await readify(directory, {sort: 'type'});
        directory = path.relative(relativeDirectory, directory);
        const encryptionManager = require('./encryptionManager');
        data = await encryptionManager.decryptReadifyNames(data, key);
        let decryptedFilePath = await encryptionManager.decryptFilePath(path.join(relativeDirectory, directory), key);
        decryptedFilePath = path.relative(relativeDirectory, decryptedFilePath);
        const re = new RegExp("\\" + path.sep, "g");
        directory = directory.replace(re, "/");
        decryptedFilePath = decryptedFilePath.replace(re, "/");
        return await render("directory", {
            files: data.files,
            path: directory,
            path_decrypted: decryptedFilePath,
            baseUrl: req.baseUrl
        }, req, res, next);
    } catch (err) {
        log.write(err);
        next(createError(404))
    }
}

async function renderFile(displayName, req, res, next) {
    if (!displayName) {
        return await fileManager.renderFile(req, res, next);
    }
    return await render("fileViewer", {name_decrypted: displayName}, req, res, next);
}

async function writeFile(filePath, contentStream, key, overwrite) {
    if (!key) return await fileManager.writeFile(filePath, contentStream, undefined, overwrite);
    const encryptionManager = require("./encryptionManager");
    const nameIV = await encryptionManager.generateIV();
    const contentIV = await encryptionManager.generateIV();
    let encryptedFilePath = await encryptionManager.encryptFileName(filePath, key, nameIV.toString("hex"));
    if (!encryptedFilePath) encryptedFilePath = filePath;
    let exists;
    try {
        await fs.promises.stat(encryptedFilePath);
        exists = true;
    } catch {
        exists = false;
    }
    if (exists && encryptedFilePath !== filePath) { //File exists and its encrypted
        log.write("File name collision. Trying another iv...");
        return await writeFile(filePath, contentStream, key, overwrite);
    } else {
        try {
            await fs.promises.appendFile(encryptedFilePath);
            await fs.promises.unlink(encryptedFilePath);
        } catch {
            encryptedFilePath = filePath;
        }
        const encryptedStream = await encryptionManager.encryptStream(contentStream, key, contentIV.toString("hex"));
        if (encryptedStream) {
            await fileManager.writeFile(encryptedFilePath, encryptedStream, [nameIV, contentIV], overwrite);
            return encryptedFilePath;
        } else {
            const err = "Couldn't encrypt file"
            log.write(err);
            return Promise.reject(err);
        }
    }
}

module.exports = Object.assign({}, fileManager, {
    createArchive: createArchive,
    processUpload: processUpload,
    readFile: readFile,
    renameDecryptDirectory: renameDecryptDirectory,
    renameEncryptDirectory: renameEncryptDirectory,
    renderDirectory: renderDirectory,
    renderFile: renderFile,
    writeFile: writeFile,
});