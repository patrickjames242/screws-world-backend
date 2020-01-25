
const http = require('http');

const server = http.createServer((request, response) => {
    response.end("Patrick is an awesome programmer!");
});

const port = process.env.PORT || 5000;

server.listen(port, () => console.log(`the server is running on port ${port}!!`));

