const Database = require("./database");
const path = require("path");

const filePath = path.join(__dirname, "..", "database.db");

module.exports = new Database(filePath);

