'use strict';

const Path = require('path');
const Wreck = require('wreck');
const Hapi = require('hapi');
require('dotenv').config();

const server = Hapi.server({
    port: 8080,
    host: 'localhost'
});

const init = async () => {

    await server.register(require('inert'));
    await server.start();
    console.log(`Server running at: ${server.info.uri}`);
    server.route({

        method: 'GET',
        path: '/',
        handler: (request, h) => {

            return 'Hello World!';
        }
    });

    server.route({

        method: 'GET',
        path: '/login',
        handler: (request, h) => {

            return h.file(Path.join(__dirname, 'public', 'login.html'));
        }
    });
};

process.on('unhandledRejection', (err) => {

    console.log(err);
    process.exit(1);
});
init();
