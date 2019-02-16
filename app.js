'use strict';

const Path = require('path');
const Wreck = require('wreck');
const Hapi = require('hapi');

// Google cloud language api
const language = require('@google-cloud/language');
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

    server.route({

        method: 'GET',
        path: '/npl',
        handler: async (request, h) => {
            
            // Instantiates a client
            const client = new language.LanguageServiceClient();
            
            // The text to analyze
            const text = 'Hello, world!';
            
            const document = {
                content: text,
                type: 'PLAIN_TEXT',
            };
            
            // Detects the sentiment of the text
            const [result] = await client.analyzeSentiment({document: document});
            const sentiment = result.documentSentiment;
            
            return (`Text: ${text}, Sentiment score: ${sentiment.score}, Sentiment magnitude: ${sentiment.magnitude}`);
        }
    })
};

process.on('unhandledRejection', (err) => {

    console.log(err);
    process.exit(1);
});
init();
