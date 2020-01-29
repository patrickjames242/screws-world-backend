
const express = require('express');
const {HTTPErrorCodes, SuccessResponse, FailureResponse, promiseCatchCallback, validateIDMiddleware} = require('./helpers.js');
const databaseClient = require('./databaseClient.js');
const {requireAuthentication} = require('./authentication');

exports.categoryInfo = {
    name: "category",
    tableName: "product_category",
}

exports.productInfo = {
    name: "product",
    tableName: "product",
}



exports.getRouterForCategoryOrProduct = function(categoryOrProductInfo) {

    const router = express.Router();

    router.use("/:id", validateIDMiddleware);

    // get all items

    router.get('/', (_, response) => {
        databaseClient.query(`select * from ${categoryOrProductInfo.tableName}`)
            .then(({ rows }) => {
                response.json(SuccessResponse(rows));
            }).catch(promiseCatchCallback(response));
    });


    // get item for id

    router.get('/:id', (request, response) => {
        const id = request.params.id;
        databaseClient.query(`select * from ${categoryOrProductInfo.tableName} where id = ${id}`)
            .then(({ rows }) => {
                const obj = rows[0];
                if (obj) {
                    response.json(SuccessResponse(obj));
                } else {
                    response.status(HTTPErrorCodes.resourceNotFound).json(FailureResponse(`No ${categoryOrProductInfo.name} exists with an id of ${id}.`));
                }
            }).catch(promiseCatchCallback(response));
    });


    // create new item

    router.post('/', requireAuthentication, (request, response) => {
        const props = request.body;

        if (props.title == undefined) {
            response.status(HTTPErrorCodes.badRequest).json(FailureResponse("The 'title' property is required, but you have not included it in the body."));
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

        databaseClient.query(`insert into ${categoryOrProductInfo.tableName} ${propNamesString} values ${valuesString} returning *`, values)
            .then(({ rows }) => {
                response.json(SuccessResponse(rows[0]));
            }).catch(promiseCatchCallback(response));
    });


    // update already existing item

    router.put('/:id', requireAuthentication, (request, response) => {
        const id = request.params.id;
        const props = request.body;
        const propsToUse = [
            { key: "title", value: props.title },
            { key: "description", value: props.description },
            { key: "parent_category", vaue: props.parent_category },
        ].filter(x => x.value != undefined);

        if (propsToUse.length === 0) {
            response.status(HTTPErrorCodes.badRequest).json(FailureResponse("You didn't send any valid properties to update the object with."));
            return;
        }

        const values = propsToUse.map(x => x.value);

        const setPropsString = propsToUse.map((x, i) => `${x.key} = $${i + 1}`).join(", ");

        databaseClient.query(`update ${categoryOrProductInfo.tableName} set ${setPropsString} where id = ${id} returning *`, values)
            .then(({ rows: [affectedRow] }) => {
                if (affectedRow) {
                    response.json(SuccessResponse(affectedRow));
                } else {
                    response.status(HTTPErrorCodes.resourceNotFound).json(FailureResponse(`No ${categoryOrProductInfo.name} exists with id of ${id}.`));
                }
            }).catch(promiseCatchCallback(response));
    });

    // delete item
    
    router.delete('/:id', requireAuthentication, (request, response) => {

        const id = request.params.id;

        databaseClient.query(`delete from ${categoryOrProductInfo.tableName} where id = ${id}`)
            .then(({ rowCount }) => {
                if (rowCount === 0) {
                    response.status(HTTPErrorCodes.resourceNotFound).json(FailureResponse(`No ${categoryOrProductInfo.name} exists with id of ${id}.`));
                } else {
                    response.json(SuccessResponse(null));
                }
            }).catch(promiseCatchCallback(response));
    });

    return router;
}
