'use strict';

const Path = require('path');
const Wreck = require('wreck');
const Hapi = require('hapi');
const EmailValidator = require("email-validator")
const firebase = require("firebase");

// Google cloud language api
const language = require('@google-cloud/language');
require('dotenv').config();

// Firebase Config stuff. 
var admin = require("firebase-admin");

// Initialize Firebase
var config = {
    apiKey: process.env.GOOGLE_FIREBASE_API_KEY,
    authDomain: process.env.GOOGLE_FIREBASE_AUTH_DOM,
    databaseURL: process.env.GOOGLE_FIREBASE_DB_URL,
    projectId: process.env.GOOGLE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.GOOGLE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.GOOGLE_FIREBASE_MESSAGING_SENDER_ID
  };
firebase.initializeApp(config);

const serviceAccount = require(Path.join(__dirname, process.env.GOOGLE_FIREBASE_DB_ADMIN_FILENAME));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.GOOGLE_FIREBASE_DB_URL
});



const server = Hapi.server({
    port: process.env.PORT || 8080,
    host: '0.0.0.0',
    routes: { cors: true }
});



const init = async () => {

    await server.register(require('inert'));
    await server.start();
    console.log(`Server running at: ${server.info.uri}`);
    server.route({

        method: 'GET',
        path: '/',
        handler: (request, h) => {

            return 'Server is up!';
        }
    });

    server.route({

        method: 'GET',
        path: '/entry',
        handler: (request, h) => {

            console.log(request.query)

            var dataPromise = admin.database().ref(`/users/${request.query.userId}/`);
            return dataPromise.once('value').then((snapshot) => {
                return snapshot.val();
            });
        }
    });

    server.route({

        method: 'PUT',
        path: '/entry',
        handler: (request, h) => {
        
            var dataPromise = admin.database().ref(`/users/${request.query.userId}/`);
            let data = dataPromise.once('value').then((snapshot) => {
                let currentEntries = snapshot.val().currentEntries || 0;
            
                    admin.database().ref('users/' + request.query.userId + `/entries/entry${currentEntries + 1}`).update({
                        text: request.query.text,
                        classifications: '' //TODO
                    });
                    admin.database().ref('users/' + request.query.userId).update({
                        currentEntries: currentEntries + 1,
                    });
            })
        
            return true;
        }
    });

    server.route({

        method: 'POST',
        path: '/nlp',
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
