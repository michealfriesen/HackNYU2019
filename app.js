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

                let userClass = {}
                console.log(snapshot.val())
                // Aggregate the entry data.
                snapshot.val().entries.forEach((entry, index) => {

                    if (entry.classifications && entry.classifications.length > 0) {

                        entry.classifications.forEach((classification, index) => {

                            if (userClass[classification.name]) {
                                userClass[classification.name].sentiment += classification.sentiment;
                                userClass[classification.name].salience += classification.salience;
                                userClass[classification.name].frequency++;
                            } else {
                                userClass[classification.name] = {

                                    sentiment: classification.sentiment,
                                    salience: classification.salience,
                                    frequency: 1
                                }
                            }
                        })
                    }
                })

                var sortable = [];
                let index = 0;
                for (var entity in userClass) {

                    sortable[index] = {
                        sal: userClass[entity].salience,
                        freq: userClass[entity].frequency,
                        sent: userClass[entity].sentiment,
                        name: Object.keys(userClass)[index],
                        index: index
                    }
                    index++;
                }

                sortable.sort(function (a, b) {
                    return b.sal - a.sal;
                });

                userClass = {}
                let thing = 0;

                if (sortable.length > 5) { thing = 5 }
                else { thing = sortable.length }
                for (let i = 0; i < thing; i++) {

                    userClass[sortable[i].name] = {
                        sentiment: sortable[i].sent,
                        salience: sortable[i].sal,
                        frequency: sortable[i].freq
                    }
                }


                admin.database().ref('users/' + request.query.userId).update({
                    userClass
                });
                return userClass
            });
        }
    })

    server.route({

        method: 'POST',
        path: '/detectMatches',
        handler: (request, h) => {

            var dataPromise = admin.database().ref(`/users`);
            return dataPromise.once('value').then((snapshot) => {

                let userArray = []

                let index = 0;
                for(var user in snapshot.val()) {

                    

                    userArray[index] = {
                        name: user,
                        class: snapshot.val()[user].userClass
                    }
                    index++;
                }

               // return (userArray)
                // Now we have the list of all users.
                // Create a "matches" array
                let matches = {};
                for (var initUser in userArray) {

                    matches[userArray[initUser].name] = {
                        conversations: []
                    }
                }
                // console.log(matches)

                // console.log('```````````````This is the user array ````````````````')
                // console.log(userArray)

                // For each user
                let i = 0;
                for (var user in userArray) {

                    // console.log('```````````````Each user ````````````````')
                    // console.log(userArray[user].name)
                    // If there is anything to compare to other classes, proceed.
                    if (userArray[user].class) {
                        // console.log(`THIS USER: ${userArray[user].name} has a class.`)
                        let commonTags = []
                        // Compare to all the other users that haven't compared to the entry yet (leftwards)
                        for (let j = i + 1; j < userArray.length; j++) {
                            console.log(`${userArray[j].name} tags= ${commonTags}`)
                            commonTags = [] // blank array to store all matched tags
                            // If there is anything to compare, then compare it.
                            if (userArray[j].class ) {

                                // console.log(`${userArray[j].name} has entries to compare!`)

                                for (let name in userArray[user].class) {

                                    // console.log(`Comparing ${name} which has a sentiment of ${userArray[user].class[name].sentiment}`)
                                    for (let otherName in userArray[j].class) {

                                        // console.log(`To ${otherName} which has a sentiment of ${userArray[j].class[otherName].sentiment}`)

                                        // The names are the same so check sentiment.
                                        if (otherName == name) {

                                            // Compare salience, then append to the array if they are similar.

                                            //TODO: Maybe this should be the average sentiment. 
                                            if(((userArray[user].class[name].sentiment > .2)&&(userArray[j].class[otherName].sentiment > .2)) || ((userArray[user].class[name].sentiment < -.2)&&(userArray[j].class[otherName].sentiment < -.2))) {

                                                commonTags.push(name)

                                                matches[userArray[user].name].conversations.push({
                                                    otherUser: userArray[j].name,
                                                    tags: commonTags
                                                })
                                                matches[userArray[j].name].conversations.push({
                                                    otherUser: userArray[user].name,
                                                    tags: commonTags
                                                })
                                            }
                                        }
                                    }
                                    console.log(commonTags)
                                }

                            }

                        }
                    }

                    i++;
                }
                for (let user in matches) {
                    admin.database().ref('users/' + user).update({
                        chats: matches[user].conversations
                    });
                }

                return matches
            })
        }
    })


};

process.on('unhandledRejection', (err) => {

    console.log(err);
    process.exit(1);
});
init();