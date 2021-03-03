const request = require("supertest");
const webserver = require('../../webserver');

test("dummy", async function() {
    const response = await request(webserver.app)
});