
const jsw = require('jsonwebtoken');
const {HTTPErrorCodes, SuccessResponse, FailureResponse, promiseCatchCallback} = require('./helpers.js');
const bcrypt = require('bcrypt');
const { sign } = require('jsonwebtoken');
const express = require('express');

const databaseClient = require('./databaseClient.js');

exports.AUTH_TOKEN_HEADER_KEY = "auth-token";

exports.requireAuthentication = function(request, response, next){
    const authTokenHeaderKey = exports.AUTH_TOKEN_HEADER_KEY;
    const authToken = request.headers[authTokenHeaderKey];
    if (authToken == undefined){
        response.status(HTTPErrorCodes.invalidAuthentication)
        .json(FailureResponse(`This request requires authentication and you have not provided an auth token. Please set the '${authTokenHeaderKey}' property in the header with an auth token retrieved from a login request.`));
        return;
    }
    jsw.verify(authToken, process.env.AUTH_TOKEN_SECRET, (error) => {
        if (error){
            response.status(HTTPErrorCodes.invalidAuthentication).json(FailureResponse("the auth token provided is not valid"));
        } else {
            next();
        }
    });
}


exports.handleLogInRoute = express.Router();

exports.handleLogInRoute.post("/", (request, response) => {
    const username = request.body.username;
    if (username == undefined){
        response.status(HTTPErrorCodes.incorrectUsernameOrPassword).json(FailureResponse("you have not provided a username"));
        return;
    }
    const password = request.body.password;
    if (password == undefined){
        response.status(HTTPErrorCodes.incorrectUsernameOrPassword).json(FailureResponse("you have not provided a password"));
        return;
    }
    const incorectUsernameOrPassword = "your username and/or password is incorrect"
    databaseClient.query(`select * from users where username = $1`, [username])
    .then(({rows: [fetchedUserInfo]}) => {
        if (!fetchedUserInfo){
            response.status(HTTPErrorCodes.incorrectUsernameOrPassword).json(FailureResponse(incorectUsernameOrPassword));
            return;
        }
        
        bcrypt.compare(password, fetchedUserInfo.hashed_password)
        .then((isPasswordCorrect) => {
            if (!isPasswordCorrect){
                response.status(HTTPErrorCodes.incorrectUsernameOrPassword).json(FailureResponse(incorectUsernameOrPassword));
                return;
            }
            new Promise((success, failure) => {
                sign({username: fetchedUserInfo.username, id: fetchedUserInfo.id}, process.env.AUTH_TOKEN_SECRET, (error, token) => {
                        if (error){failure(error);} else {success(token);}
                });
            })
            .then((token) => {
                response.json(SuccessResponse({authToken: token}));
            })
            .catch(promiseCatchCallback(response));
        })
        .catch(promiseCatchCallback(response));
    })
    .catch(promiseCatchCallback(response));
});



// call the function below to add a new username and password to the database

// function createNewUser(username, password){
//     const saltRounds = 10;
//     return bcrypt.hash(password, saltRounds)
//     .then((hash) => {
//         return databaseClient.query(`insert into users (username, hashed_password) values ($1, $2) returning *`, [username, hash]);
//     })
//     .then(({rows: [row1]}) => {
//         return Promise.resolve(row1);
//     });
// }