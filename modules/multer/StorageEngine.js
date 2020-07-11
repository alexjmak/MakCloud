class StorageEngine {
    #writeFile;

    constructor(writeFile) {
        this.#writeFile = writeFile;
    }


    _handleFile (req, file, cb) {
        this.#writeFile(file, function(err) {
            if (err) {
                log.write(err);
                cb(err);
            } else {
                cb(null);
            }
        });
    }

    _removeFile = function _removeFile (req, file, cb) {
        cb(null);
    }


}

module.exports = function(writeFile) {
    return new StorageEngine(writeFile);
}
