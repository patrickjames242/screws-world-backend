

require('dotenv').config();
const express = require('express');
const { getCategoriesRouter, getProductsRouter} = require('./productsOrCategoriesRoute.js');
const {handleLogInRoute, AUTH_TOKEN_HEADER_KEY} = require('./authentication.js');
const {sendErrorResponseToClient} = require('./helpers.js');
const {getEmailRouter} = require('./email.js');
const app = express();

app.use(express.json());
app.use(express.raw({type: "image/*", limit: "10mb"}));


function corsHandlerMiddleware(request, response, next){
    
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, PUT");
    response.setHeader("Access-Control-Allow-Headers", `Content-Type, ${AUTH_TOKEN_HEADER_KEY}`);

    const isPreflightRequest = request.method === 'OPTIONS' && request.headers['origin'] && request.headers['access-control-request-method'];

    if (isPreflightRequest){
        response.end();
        return;
    }
    next();
}

app.use(corsHandlerMiddleware);
app.use('/login', handleLogInRoute);
app.use('/categories', getCategoriesRouter());
app.use('/products', getProductsRouter());
app.use('/email', getEmailRouter());
app.use((error, request, response, next) => {
    sendErrorResponseToClient(response, error);
});

const port = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server started on port ${port}`));






