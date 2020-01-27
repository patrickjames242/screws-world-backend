
const express = require('express');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();


/*

database tables

create table product_category(
    id serial primary key,
    title text not null,
    description text,
    parent_category int references product_category on delete cascade,
    constraint parent_cannot_be_self check (parent_category != id)
);

create table product (
    id serial primary key,
    title text not null,
    description text,
    parent_category int references product_category on delete cascade,
    constraint parent_cannot_be_self check (parent_category != id)
)

CREATE TABLE users(
    id serial PRIMARY key,
    username text NOT NULL unique,
    hashed_password text NOT NULL
)

*/


const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: true,
});


client.connect();





const serverErrorCode = 500;
const badRequestCode = 400;
const errorTypes = {
    invalidAuthToken: "invalid_auth_token",
}

function SuccessResponse(data) {
    return {
        status: 'success',
        data: data,
    }
}

function FailureResponse(errorMessage, errorType) {
    return {
        status: 'failure',
        errorMessage,
        errorType,
    }
}

function promiseCatchCallback(response){
    return (error) => {
        response.status(serverErrorCode).json(FailureResponse("A server error occured. Here it is 👉🏽 " + error.message));
    }
}





// replaces the id string with a number if it is valid, sends an error and returns null if it isn't;
function validateIDMiddleware(request, response, next) {
    const id = Number(request.params.id);
    if (isNaN(id) === true) {
        response.status(badRequestCode).json(FailureResponse(`the id of '${request.params.id}' is invalid`));
        return;
    } else {
        request.params.id = id;
        next();
    }
}

const categoryInfo = {
    name: "category",
    tableName: "product_category",
}

const productInfo = {
    name: "product",
    tableName: "product",
}

function requireAuthentication(request, response, next){
    const authToken = request.headers["auth-token"];
    if (authToken == undefined){
        response.status(badRequestCode).json(FailureResponse("this request requires authentication and you have not provided an auth token"));
        return;
    }
    jwt.verify(authToken, process.env.AUTH_TOKEN_SECRET, (error) => {
        if (error){
            response.status(badRequestCode).json(FailureResponse("the auth token provided is not valid",  errorTypes.invalidAuthToken));
        } else {
            next();
        }
    });
}

function getRouterForCategoryOrProduct(categoryOrProductInfo) {

    const router = express.Router();

    router.use("/:id", validateIDMiddleware);

    router.get('/', (_, response) => {
        client.query(`select * from ${categoryOrProductInfo.tableName}`)
            .then(({ rows }) => {
                response.json(SuccessResponse(rows));
            }).catch(promiseCatchCallback(response));
    });

    router.get('/:id', (request, response) => {
        const id = request.params.id;
        client.query(`select * from ${categoryOrProductInfo.tableName} where id = ${id}`)
            .then(({ rows }) => {
                const obj = rows[0];
                if (obj) {
                    response.json(SuccessResponse(obj));
                } else {
                    response.status(badRequestCode).json(FailureResponse(`could not find a ${categoryOrProductInfo.name} with an id of ${id}`));
                }
            }).catch(promiseCatchCallback(response));
    });

    router.post('/', requireAuthentication, (request, response) => {
        const props = request.body;

        if (props.title == undefined) {
            response.status(badRequestCode).json(FailureResponse("The 'title' property is required, but you have not included it in the body."));
            return;
        }

        const propsToUse = [
            { key: "title", value: props.title },
            { key: "description", value: props.description },
            { key: "parent_category", vaue: props.parent_category },
        ].filter(x => x.value != undefined);

        const propNamesString = `(${propsToUse.map(x => x.key).join(", ")})`;
        const valuesString = `(${propsToUse.map((_, i) => "$" + (i + 1)).join(", ")})`;
        const values = propsToUse.map(x => x.value);

        client.query(`insert into ${categoryOrProductInfo.tableName} ${propNamesString} values ${valuesString} returning *`, values)
            .then(({ rows }) => {
                response.json(SuccessResponse(rows[0]));
            }).catch(promiseCatchCallback(response));
    });

    router.put('/:id', requireAuthentication, (request, response) => {
        const id = request.params.id;
        const props = request.body;
        const propsToUse = [
            { key: "title", value: props.title },
            { key: "description", value: props.description },
            { key: "parent_category", vaue: props.parent_category },
        ].filter(x => x.value != undefined);

        if (propsToUse.length === 0) {
            response.status(badRequestCode).json(FailureResponse("you didn't send any valid properties to update the object with"));
            return;
        }

        const values = propsToUse.map(x => x.value);

        const setPropsString = propsToUse.map((x, i) => `${x.key} = $${i + 1}`).join(", ");

        client.query(`update ${categoryOrProductInfo.tableName} set ${setPropsString} where id = ${id} returning *`, values)
            .then(({ rows: [affectedRow] }) => {
                if (affectedRow) {
                    response.json(SuccessResponse(affectedRow));
                } else {
                    response.status(badRequestCode).json(FailureResponse(`no ${categoryOrProductInfo.name} exists with id of ${id}`));
                }
            }).catch(promiseCatchCallback(response));
    });


    router.delete('/:id', requireAuthentication, (request, response) => {

        const id = request.params.id;

        client.query(`delete from ${categoryOrProductInfo.tableName} where id = ${id}`)
            .then(({ rowCount }) => {
                if (rowCount === 0) {
                    response.status(badRequestCode).json(FailureResponse(`no ${categoryOrProductInfo.name} exists with id of ${id}`));
                } else {
                    response.json(SuccessResponse(null));
                }
            }).catch(promiseCatchCallback(response));
    });

    return router;
}

const app = express();



app.use(express.json());

app.post('/login', (request, response) => {
    const username = request.body.username;
    if (username == undefined){
        response.status(badRequestCode).json(FailureResponse("you have not provided a username"));
        return;
    }
    const password = request.body.password;
    if (password == undefined){
        response.status(badRequestCode).json(FailureResponse("you have not provided a password"));
        return;
    }
    const incorectUsernameOrPassword = "your username and/or password is incorrect"

    client.query(`select * from users where username = $1`, [username])
    .then(({rows: [fetchedUserInfo]}) => {
        if (!fetchedUserInfo){
            response.json(FailureResponse(incorectUsernameOrPassword));
            return;
        }
        
        bcrypt.compare(password, fetchedUserInfo.hashed_password)
        .then((isPasswordCorrect) => {
            if (!isPasswordCorrect){
                response.status(badRequestCode).json(FailureResponse(incorectUsernameOrPassword));
                return;
            }
            new Promise((success, failure) => {
                jwt.sign({username: fetchedUserInfo.username, id: fetchedUserInfo.id}, process.env.AUTH_TOKEN_SECRET, (error, token) => {
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

app.use('/categories', getRouterForCategoryOrProduct(categoryInfo));
app.use('/products', getRouterForCategoryOrProduct(productInfo));

const port = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server started on port ${port}`));



// call the function below to add a new username and password to the database

// function createNewUser(username, password){
//     const saltRounds = 10;
//     return bcrypt.hash(password, saltRounds)
//     .then((hash) => {
//         return client.query(`insert into users (username, hashed_password) values ($1, $2) returning *`, [username, hash]);
//     })
//     .then(({rows: [row1]}) => {
//         return Promise.resolve(row1);
//     });
// }

