
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

    function sendInvalidAuthTokenError(){
        response.status(HTTPErrorCodes.invalidAuthentication).json(FailureResponse("The auth token provided is not valid."));
    }

    const accessTokenPayload = jsw.decode(authToken);
    
    if (accessTokenPayload == null || accessTokenPayload.id == null){
        sendInvalidAuthTokenError();
        return;
    }

    databaseClient.query("select hashed_password from users where id = $1", [accessTokenPayload.id])
    .then(({rows: [firstRow]}) => {
        if (firstRow == null){
            sendInvalidAuthTokenError();
            return;
        }
        const hashedPassword = firstRow.hashed_password;
        jsw.verify(authToken, hashedPassword, (error) => {
            if (error != null){
                sendInvalidAuthTokenError();
            } else {
                next();
            }
        });
    })
    .catch(promiseCatchCallback(response));
}


exports.handleLogInRoute = express.Router();

exports.handleLogInRoute.post("/", (request, response) => {
    const username = request.body.username;
    if (username == undefined){
        response.status(HTTPErrorCodes.incorrectUsernameOrPassword).json(FailureResponse("You have not provided a username."));
        return;
    }
    const password = request.body.password;
    if (password == undefined){
        response.status(HTTPErrorCodes.incorrectUsernameOrPassword).json(FailureResponse("You have not provided a password."));
        return;
    }
    const incorectUsernameOrPassword = "Your username and/or password is incorrect."
    databaseClient.query(`select * from users where username = $1`, [username])
    .then(({rows: [fetchedUserInfo]}) => {
        if (!fetchedUserInfo){
            response.status(HTTPErrorCodes.incorrectUsernameOrPassword).json(FailureResponse(incorectUsernameOrPassword));
            return;
        }
        
        bcrypt.compare(password, fetchedUserInfo.hashed_password)
        .then((isPasswordCorrect) => {
            if (isPasswordCorrect == false){
                response.status(HTTPErrorCodes.incorrectUsernameOrPassword).json(FailureResponse(incorectUsernameOrPassword));
                return;
            }
            new Promise((success, failure) => {
                sign({id: fetchedUserInfo.id}, fetchedUserInfo.hashed_password, (error, token) => {
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



// call the function below to add a new username and password to the database, or update the password if the username already exists

// async function createNewUserOrUpdateUserPassword(username, password){
//     const saltRounds = 10;
//     const hash = await bcrypt.hash(password, saltRounds);
    
//     const { rows: [row1] } = await databaseClient.query(`

//     insert into users (username, hashed_password) values ($1, $2)

//     ON conflict ON CONSTRAINT username_must_be_unique DO UPDATE SET hashed_password = EXCLUDED.hashed_password
    
//     returning *

//     `, [username, hash]);
//     return Promise.resolve(row1);
// }


