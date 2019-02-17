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
    routes: {
        cors: true
    }
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

            var dataPromise = admin.database().ref(`/users/${request.query.userId}/`);
            return dataPromise.once('value').then((snapshot) => {
                return snapshot.val();
            });
        }
    });

    server.route({

        method: 'POST',
        path: '/entry',
        handler: (request, h) => {

            return new Promise((resolve, reject) => {

                var dataPromise = admin.database().ref(`/users/${request.query.userId}/`);
                return dataPromise.once('value').then((snapshot) => {
                    let currentEntries = snapshot.val().currentEntries;
                    if (currentEntries == null) {
                        currentEntries = 0;
                    }

                    let update = {
                        date: new Date().toString(),
                        id: currentEntries + 1,
                    };

                    admin.database().ref('users/' + request.query.userId + `/entries/${currentEntries + 1}`).update({
                        date: new Date().toString(),
                        id: currentEntries + 1,
                        title: '',
                        body: '',
                        classification: ''

                    });
                    admin.database().ref('users/' + request.query.userId).update({
                        currentEntries: currentEntries + 1,
                    });

                    return resolve(update);
                    })
                    .catch(err => {
                        console.error('ERROR:', err);
                        return reject('error')
                    });
                })
            }
        })


    server.route({

        method: 'PUT',
        path: '/entry',
        handler: (request, h) => {

            return new Promise((resolve, reject) => {
                // Function to do classificiation (Because we are resubmitting)
                const document = {
                    content: request.query.entryBody,
                    type: 'PLAIN_TEXT',
                };
                // Instantiates a client
                const client = new language.LanguageServiceClient();


                let classificationArray = []
                // Detects the sentiment of the text
                // Detects the sentiment of the document
                return client
                    .analyzeEntitySentiment({
                        document: document
                    })
                    .then(results => {

                        results[0].entities.forEach((entity, index) => {
                            classificationArray[index] = {
                                name: entity.name.toLowerCase(),
                                salience: entity.salience,
                                sentiment: entity.sentiment.score
                            }
                        })

                        const update = {
                            body: request.query.entryBody,
                            classifications: classificationArray,
                            title: request.query.entryTitle,
                            date: new Date().toString() 
                        }

                        admin.database().ref('users/' + request.query.userId + `/entries/${request.query.entryId}`).update({
                            body: request.query.entryBody,
                            classifications: classificationArray,
                            title: request.query.entryTitle,
                            date: new Date().toString()
                        });

                        return resolve(update);
                    })
                    .catch(err => {
                        console.error('ERROR:', err);
                        return reject(err);
                    });
            })
        }
    })

    server.route({

        method: 'POST',
        path: '/nlp',
        handler: async (request, h) => {

            // Getting the text to analyze
            let dataPromise = admin.database().ref(`/users/${request.query.userId}/entries/${request.query.entryNumber}`);
            return dataPromise.once('value').then((snapshot) => {
                const body = snapshot.val().body;


                const document = {
                    content: body,
                    type: 'PLAIN_TEXT',
                };
                // Instantiates a client
                const client = new language.LanguageServiceClient();

                // Detects the sentiment of the text
                // Detects the sentiment of the document
                client
                    .analyzeEntitySentiment({
                        document: document
                    })
                    .then(results => {

                        results[0].entities.forEach((entity, index) => {
                            console.log(`Title: ${entity.name.toLowerCase()} Salience: ${entity.salience} Sentiment: ${entity.sentiment.score}`);

                            admin.database().ref(`users/${request.query.userId}/entries/${request.query.entryNumber}/classifications/${index}`).update({
                                name: entity.name.toLowerCase(),
                                salience: entity.salience,
                                sentiment: entity.sentiment.score
                            });
                        })
                    })
                    .catch(err => {
                        console.error('ERROR:', err);
                    });

                // Do something here.
                return 'ayy'
            });
        },
    })

    server.route({

        method: 'POST',
        path: '/nlpUser',
        handler: (request, h) => {

            var dataPromise = admin.database().ref(`/users/${request.query.userId}/`);
            return dataPromise.once('value').then((snapshot) => {
                return snapshot.val();
            });
        }
    })
};

process.on('unhandledRejection', (err) => {

    console.log(err);
    process.exit(1);
});
init();