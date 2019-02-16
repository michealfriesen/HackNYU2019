'use strict';

const Path = require('path');
const Wreck = require('wreck');
const Hapi = require('hapi');

// Google cloud language api
const language = require('@google-cloud/language');
require('dotenv').config();

const server = Hapi.server({
    port: process.env.PORT || 8080,
    host: '0.0.0.0'
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

    server.route({

        method: 'POST',
        path: '/nlp',
        config: {
            cors: {
                origin: ['*'],
                additionalHeaders: ['cache-control', 'x-requested-with']
            }
        },
        handler: async (request, h) => {

            // Instantiates a client
            const client = new language.LanguageServiceClient();
            
            // The text to analyze
            const text = request.payload.text;
            
            const document = {
                content: text,
                type: 'PLAIN_TEXT',
            };
            
            // Detects the sentiment of the text
            const [result] = await client.analyzeEntitySentiment({document: document});

            return result;
        },
    })
};

process.on('unhandledRejection', (err) => {

    console.log(err);
    process.exit(1);
});
init();
